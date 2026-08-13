import os
import io
import sqlite3
import secrets
from datetime import datetime, timedelta

import boto3

from botocore.exceptions import ClientError

from dotenv import load_dotenv

from flask import (
    Flask,
    request,
    jsonify,
    send_file,
    render_template
)


# =========================================================
# Configuration
# =========================================================

load_dotenv()

app = Flask(__name__)

AWS_REGION = os.getenv(
    "AWS_REGION",
    "ap-south-1"
)

S3_BUCKET = os.getenv(
    "S3_BUCKET_NAME"
)

s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    aws_access_key_id=os.getenv(
        "AWS_ACCESS_KEY_ID"
    ),
    aws_secret_access_key=os.getenv(
        "AWS_SECRET_ACCESS_KEY"
    )
)


DATABASE = "cloudvault.db"


# =========================================================
# Database
# =========================================================

def get_db():

    connection = sqlite3.connect(
        DATABASE
    )

    connection.row_factory = sqlite3.Row

    return connection


def init_db():

    db = get_db()

    db.execute("""
        CREATE TABLE IF NOT EXISTS shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token TEXT UNIQUE NOT NULL,
            s3_key TEXT NOT NULL,
            permission TEXT DEFAULT 'view',
            expires_at TEXT,
            created_at TEXT NOT NULL
        )
    """)

    db.commit()

    db.close()


init_db()


# =========================================================
# Helper functions
# =========================================================

def normalize_prefix(prefix):

    if not prefix:
        return ""

    prefix = prefix.strip("/")

    if prefix:
        return prefix + "/"

    return ""


def format_s3_item(obj):

    return {
        "key": obj["Key"],
        "name": obj["Key"].rstrip("/").split("/")[-1],
        "size": obj.get("Size", 0),
        "last_modified": (
            obj["LastModified"].isoformat()
            if obj.get("LastModified")
            else None
        ),
        "is_folder": obj["Key"].endswith("/")
    }


# =========================================================
# HOME
# =========================================================

@app.route("/")
def home():

    return render_template(
        "index.html"
    )


# =========================================================
# LIST DIRECTORY
# =========================================================

@app.route("/api/files", methods=["GET"])
def list_files():

    prefix = normalize_prefix(
        request.args.get(
            "prefix",
            ""
        )
    )

    try:

        response = s3.list_objects_v2(
            Bucket=S3_BUCKET,
            Prefix=prefix,
            Delimiter="/"
        )

        folders = []

        for common_prefix in response.get(
            "CommonPrefixes",
            []
        ):

            folder_key = common_prefix[
                "Prefix"
            ]

            folders.append({
                "key": folder_key,
                "name": folder_key[
                    len(prefix):
                ].rstrip("/"),
                "is_folder": True
            })


        files = []

        for obj in response.get(
            "Contents",
            []
        ):

            key = obj["Key"]

            # Don't display the directory marker itself
            if key == prefix:
                continue

            files.append(
                format_s3_item(obj)
            )


        return jsonify({
            "prefix": prefix,
            "folders": folders,
            "files": files
        })


    except ClientError as e:

        return jsonify({
            "error": str(e)
        }), 500


# =========================================================
# CREATE DIRECTORY
# =========================================================

@app.route(
    "/api/folders",
    methods=["POST"]
)
def create_folder():

    data = request.get_json(
        silent=True
    ) or {}

    name = data.get(
        "name",
        ""
    ).strip()

    parent = normalize_prefix(
        data.get(
            "parent",
            ""
        )
    )


    if not name:

        return jsonify({
            "error": "Folder name is required"
        }), 400


    if "/" in name:

        return jsonify({
            "error":
                "Folder name cannot contain /"
        }), 400


    folder_key = (
        parent +
        name +
        "/"
    )


    try:

        s3.put_object(
            Bucket=S3_BUCKET,
            Key=folder_key,
            Body=b""
        )


        return jsonify({
            "message":
                "Folder created successfully",
            "folder": folder_key
        }), 201


    except ClientError as e:

        return jsonify({
            "error": str(e)
        }), 500


# =========================================================
# UPLOAD FILE
# =========================================================

@app.route(
    "/api/files",
    methods=["POST"]
)
def upload_file():

    if "file" not in request.files:

        return jsonify({
            "error": "No file provided"
        }), 400


    file = request.files["file"]

    if not file.filename:

        return jsonify({
            "error": "Filename is empty"
        }), 400


    prefix = normalize_prefix(
        request.form.get(
            "prefix",
            ""
        )
    )


    key = (
        prefix +
        file.filename
    )


    try:

        s3.upload_fileobj(
            file,
            S3_BUCKET,
            key,
            ExtraArgs={
                "ContentType":
                    file.content_type
                    or "application/octet-stream"
            }
        )


        return jsonify({
            "message":
                "File uploaded successfully",
            "key": key
        }), 201


    except ClientError as e:

        return jsonify({
            "error": str(e)
        }), 500


# =========================================================
# DOWNLOAD FILE
# =========================================================

@app.route(
    "/api/download",
    methods=["GET"]
)
def download_file():

    key = request.args.get(
        "key"
    )

    if not key:

        return jsonify({
            "error": "File key required"
        }), 400


    try:

        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": key
            },
            ExpiresIn=900
        )


        return jsonify({
            "url": url
        })


    except ClientError as e:

        return jsonify({
            "error": str(e)
        }), 500


# =========================================================
# DELETE FILE / FOLDER
# =========================================================

@app.route(
    "/api/files",
    methods=["DELETE"]
)
def delete_file():

    key = request.args.get(
        "key"
    )

    if not key:

        return jsonify({
            "error": "File key required"
        }), 400


    try:

        # Folder
        if key.endswith("/"):

            response = s3.list_objects_v2(
                Bucket=S3_BUCKET,
                Prefix=key
            )

            objects = response.get(
                "Contents",
                []
            )

            if objects:

                s3.delete_objects(
                    Bucket=S3_BUCKET,
                    Delete={
                        "Objects": [
                            {
                                "Key":
                                    obj["Key"]
                            }
                            for obj in objects
                        ]
                    }
                )

        else:

            s3.delete_object(
                Bucket=S3_BUCKET,
                Key=key
            )


        return jsonify({
            "message":
                "Deleted successfully"
        })


    except ClientError as e:

        return jsonify({
            "error": str(e)
        }), 500


# =========================================================
# VERSION HISTORY
# =========================================================

@app.route(
    "/api/versions",
    methods=["GET"]
)
def get_versions():

    key = request.args.get(
        "key"
    )

    if not key:

        return jsonify({
            "error": "File key required"
        }), 400


    try:

        response = s3.list_object_versions(
            Bucket=S3_BUCKET,
            Prefix=key
        )


        versions = []


        for version in response.get(
            "Versions",
            []
        ):

            if version["Key"] != key:
                continue


            versions.append({
                "version_id":
                    version["VersionId"],

                "size":
                    version.get(
                        "Size",
                        0
                    ),

                "last_modified":
                    version[
                        "LastModified"
                    ].isoformat(),

                "is_latest":
                    version.get(
                        "IsLatest",
                        False
                    ),

                "etag":
                    version.get(
                        "ETag",
                        ""
                    )
            })


        return jsonify({
            "versions": versions
        })


    except ClientError as e:

        return jsonify({
            "error": str(e)
        }), 500


# =========================================================
# DOWNLOAD VERSION
# =========================================================

@app.route(
    "/api/version-download",
    methods=["GET"]
)
def download_version():

    key = request.args.get(
        "key"
    )

    version_id = request.args.get(
        "version_id"
    )


    if not key or not version_id:

        return jsonify({
            "error":
                "Key and version ID required"
        }), 400


    try:

        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket":
                    S3_BUCKET,

                "Key":
                    key,

                "VersionId":
                    version_id
            },
            ExpiresIn=900
        )


        return jsonify({
            "url": url
        })


    except ClientError as e:

        return jsonify({
            "error": str(e)
        }), 500


# =========================================================
# CREATE SHARE LINK
# =========================================================

@app.route(
    "/api/share",
    methods=["POST"]
)
def create_share():

    data = request.get_json(
        silent=True
    ) or {}


    key = data.get(
        "key"
    )

    permission = data.get(
        "permission",
        "view"
    )

    expires_hours = int(
        data.get(
            "expires_hours",
            24
        )
    )


    if not key:

        return jsonify({
            "error":
                "File key required"
        }), 400


    if permission not in [
        "view",
        "download"
    ]:

        return jsonify({
            "error":
                "Invalid permission"
        }), 400


    token = secrets.token_urlsafe(
        32
    )


    expires_at = (
        datetime.utcnow()
        +
        timedelta(
            hours=expires_hours
        )
    ).isoformat()


    db = get_db()


    db.execute(
        """
        INSERT INTO shares
        (token, s3_key, permission, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            token,
            key,
            permission,
            expires_at,
            datetime.utcnow().isoformat()
        )
    )


    db.commit()

    db.close()


    share_url = (
        request.host_url.rstrip("/")
        +
        "/shared/"
        +
        token
    )


    return jsonify({
        "message":
            "Share link created",

        "url":
            share_url,

        "expires_at":
            expires_at
    }), 201


# =========================================================
# SHARED FILE
# =========================================================

@app.route(
    "/shared/<token>",
    methods=["GET"]
)
def shared_file(token):

    db = get_db()


    share = db.execute(
        """
        SELECT *
        FROM shares
        WHERE token = ?
        """,
        (token,)
    ).fetchone()


    db.close()


    if not share:

        return jsonify({
            "error":
                "Invalid share link"
        }), 404


    expires_at = datetime.fromisoformat(
        share["expires_at"]
    )


    if datetime.utcnow() > expires_at:

        return jsonify({
            "error":
                "Share link has expired"
        }), 410


    try:

        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket":
                    S3_BUCKET,

                "Key":
                    share["s3_key"]
            },
            ExpiresIn=600
        )


        return jsonify({
            "key":
                share["s3_key"],

            "permission":
                share["permission"],

            "url":
                url
        })


    except ClientError as e:

        return jsonify({
            "error": str(e)
        }), 500


# =========================================================
# START
# =========================================================

if __name__ == "__main__":

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True
    )