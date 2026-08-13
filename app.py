import os
import io

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_file

load_dotenv()

app = Flask(__name__)

# --------------------------------------------------
# Configuration
# --------------------------------------------------

AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
S3_BUCKET = os.getenv("S3_BUCKET_NAME")

s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY")
)


# --------------------------------------------------
# Health Check
# --------------------------------------------------

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "message": "S3 File Manager API",
        "status": "running"
    })


# --------------------------------------------------
# CREATE
# Upload file to S3
# POST /files
# --------------------------------------------------

@app.route("/files", methods=["POST"])
def upload_file():

    if "file" not in request.files:
        return jsonify({
            "error": "No file provided"
        }), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({
            "error": "Filename is empty"
        }), 400

    try:
        s3.upload_fileobj(
            file,
            S3_BUCKET,
            file.filename,
            ExtraArgs={
                "ContentType": file.content_type
            }
        )

        return jsonify({
            "message": "File uploaded successfully",
            "filename": file.filename,
            "bucket": S3_BUCKET
        }), 201

    except ClientError as e:
        return jsonify({
            "error": str(e)
        }), 500


# --------------------------------------------------
# READ
# List all files
# GET /files
# --------------------------------------------------

@app.route("/files", methods=["GET"])
def list_files():

    try:
        response = s3.list_objects_v2(
            Bucket=S3_BUCKET
        )

        files = []

        for obj in response.get("Contents", []):
            files.append({
                "filename": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat()
            })

        return jsonify({
            "count": len(files),
            "files": files
        })

    except ClientError as e:
        return jsonify({
            "error": str(e)
        }), 500


# --------------------------------------------------
# READ
# Download a file
# GET /files/<filename>
# --------------------------------------------------

@app.route("/files/<path:filename>", methods=["GET"])
def download_file(filename):

    try:
        response = s3.get_object(
            Bucket=S3_BUCKET,
            Key=filename
        )

        file_data = response["Body"].read()

        return send_file(
            io.BytesIO(file_data),
            download_name=filename.split("/")[-1],
            as_attachment=True,
            mimetype=response.get(
                "ContentType",
                "application/octet-stream"
            )
        )

    except ClientError as e:

        error_code = e.response["Error"]["Code"]

        if error_code in ["NoSuchKey", "404"]:
            return jsonify({
                "error": "File not found"
            }), 404

        return jsonify({
            "error": str(e)
        }), 500


# --------------------------------------------------
# UPDATE
# Replace an existing file
# PUT /files/<filename>
# --------------------------------------------------

@app.route("/files/<path:filename>", methods=["PUT"])
def update_file(filename):

    if "file" not in request.files:
        return jsonify({
            "error": "No file provided"
        }), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({
            "error": "Filename is empty"
        }), 400

    try:

        # Check whether the original file exists
        s3.head_object(
            Bucket=S3_BUCKET,
            Key=filename
        )

        # Replace it
        s3.upload_fileobj(
            file,
            S3_BUCKET,
            filename,
            ExtraArgs={
                "ContentType": file.content_type
            }
        )

        return jsonify({
            "message": "File updated successfully",
            "filename": filename
        })

    except ClientError as e:

        error_code = e.response["Error"]["Code"]

        if error_code in ["404", "NoSuchKey", "NotFound"]:
            return jsonify({
                "error": "File does not exist"
            }), 404

        return jsonify({
            "error": str(e)
        }), 500


# --------------------------------------------------
# DELETE
# Delete file from S3
# DELETE /files/<filename>
# --------------------------------------------------

@app.route("/files/<path:filename>", methods=["DELETE"])
def delete_file(filename):

    try:

        # Check whether file exists
        s3.head_object(
            Bucket=S3_BUCKET,
            Key=filename
        )

        # Delete
        s3.delete_object(
            Bucket=S3_BUCKET,
            Key=filename
        )

        return jsonify({
            "message": "File deleted successfully",
            "filename": filename
        })

    except ClientError as e:

        error_code = e.response["Error"]["Code"]

        if error_code in ["404", "NoSuchKey", "NotFound"]:
            return jsonify({
                "error": "File does not exist"
            }), 404

        return jsonify({
            "error": str(e)
        }), 500


# --------------------------------------------------
# Run application
# --------------------------------------------------

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )