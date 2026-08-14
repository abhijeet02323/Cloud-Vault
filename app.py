import os
import json
import secrets
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from pathlib import PurePosixPath

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv
from flask import Flask, jsonify, redirect, render_template, request, session, url_for


load_dotenv()

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.getenv("FLASK_SECRET_KEY") or secrets.token_urlsafe(32),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

AWS_REGION = os.getenv("AWS_REGION", "ap-south-1")
S3_BUCKET = os.getenv("S3_BUCKET_NAME")
s3 = boto3.client(
    "s3",
    region_name=AWS_REGION,
    aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
)

GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"


def github_configured():
    return bool(os.getenv("GITHUB_CLIENT_ID") and os.getenv("GITHUB_CLIENT_SECRET"))


def github_redirect_uri():
    return os.getenv("GITHUB_OAUTH_REDIRECT_URI") or url_for("github_callback", _external=True)


def github_json(url, method="GET", data=None, headers=None):
    encoded_data = urlencode(data).encode() if data else None
    request_headers = {"Accept": "application/json", "User-Agent": "CloudVault"}
    request_headers.update(headers or {})
    github_request = Request(url, data=encoded_data, headers=request_headers, method=method)
    with urlopen(github_request, timeout=10) as response:
        return json.loads(response.read().decode())


@app.before_request
def require_login():
    public_endpoints = {"login", "github_callback", "static"}
    if request.endpoint in public_endpoints or session.get("user"):
        return None
    if request.path.startswith("/api/"):
        return jsonify({"error": "Authentication required"}), 401
    return redirect(url_for("login"))


def s3_error(error):
    return jsonify({"error": str(error)}), 502


def require_bucket():
    if S3_BUCKET:
        return None
    return jsonify({"error": "S3_BUCKET_NAME is not configured"}), 500


def normalize_prefix(value):
    """Return a safe S3 prefix ending in '/'."""
    value = (value or "").strip().strip("/")
    if not value:
        return ""
    parts = PurePosixPath(value).parts
    if any(part in {".", ".."} for part in parts):
        raise ValueError("Invalid folder path")
    return "/".join(parts) + "/"


def validate_key(value, allow_folder=True):
    value = (value or "").strip().lstrip("/")
    if not value or "\x00" in value:
        raise ValueError("A file or folder key is required")
    if not allow_folder and value.endswith("/"):
        raise ValueError("A file key is required")
    parts = PurePosixPath(value.rstrip("/")).parts
    if any(part in {".", ".."} for part in parts):
        raise ValueError("Invalid file or folder key")
    return value


def upload_name(filename):
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1].strip()
    if not name or name in {".", ".."} or "\x00" in name:
        raise ValueError("Invalid file name")
    return name


def file_item(obj):
    return {
        "key": obj["Key"],
        "name": obj["Key"].rsplit("/", 1)[-1],
        "size": obj.get("Size", 0),
        "last_modified": obj["LastModified"].isoformat() if obj.get("LastModified") else None,
    }


def version_item(version):
    return {
        "version_id": version["VersionId"],
        "size": version.get("Size", 0),
        "last_modified": version["LastModified"].isoformat() if version.get("LastModified") else None,
        "is_latest": version.get("IsLatest", False),
    }


@app.route("/")
def home():
    return render_template("index.html", user=session["user"])


@app.route("/login")
def login():
    if session.get("user"):
        return redirect(url_for("home"))
    if not github_configured():
        return "GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to .env.", 500
    state = secrets.token_urlsafe(32)
    session["github_oauth_state"] = state
    parameters = urlencode({
        "client_id": os.environ["GITHUB_CLIENT_ID"],
        "redirect_uri": github_redirect_uri(),
        "scope": "read:user user:email",
        "state": state,
    })
    return redirect(f"{GITHUB_AUTHORIZE_URL}?{parameters}")


@app.route("/auth/github/callback")
def github_callback():
    if request.args.get("error"):
        return f"GitHub sign-in was cancelled: {request.args.get('error')}", 400
    state = request.args.get("state")
    code = request.args.get("code")
    if not code or not state or not secrets.compare_digest(state, session.pop("github_oauth_state", "")):
        return "Invalid GitHub OAuth state.", 400
    try:
        token = github_json(GITHUB_TOKEN_URL, method="POST", data={
            "client_id": os.environ["GITHUB_CLIENT_ID"],
            "client_secret": os.environ["GITHUB_CLIENT_SECRET"],
            "code": code,
            "redirect_uri": github_redirect_uri(),
        })
        access_token = token.get("access_token")
        if not access_token:
            return "GitHub did not return an access token.", 400
        user = github_json(GITHUB_USER_URL, headers={"Accept": "application/vnd.github+json", "Authorization": f"Bearer {access_token}"})
    except (HTTPError, URLError, ValueError, TimeoutError) as error:
        return f"GitHub sign-in could not be completed: {error}", 502

    session.clear()
    session["user"] = {"id": user["id"], "login": user["login"], "avatar_url": user.get("avatar_url", "")}
    return redirect(url_for("home"))


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/api/files", methods=["GET"])
def list_files():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    try:
        prefix = normalize_prefix(request.args.get("prefix", ""))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    folders, files, continuation = {}, [], None
    try:
        while True:
            params = {"Bucket": S3_BUCKET, "Prefix": prefix, "Delimiter": "/"}
            if continuation:
                params["ContinuationToken"] = continuation
            response = s3.list_objects_v2(**params)
            for item in response.get("CommonPrefixes", []):
                key = item["Prefix"]
                folders[key] = {"key": key, "name": key[len(prefix):].rstrip("/")}
            for item in response.get("Contents", []):
                if item["Key"] != prefix:
                    files.append(file_item(item))
            if not response.get("IsTruncated"):
                break
            continuation = response.get("NextContinuationToken")
            if not continuation:
                break
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)

    return jsonify({
        "prefix": prefix,
        "folders": sorted(folders.values(), key=lambda item: item["name"].lower()),
        "files": sorted(files, key=lambda item: item["name"].lower()),
    })


@app.route("/api/folders", methods=["POST"])
def create_folder():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    data = request.get_json(silent=True) or {}
    try:
        raw_name = str(data.get("name") or "").strip()
        if "/" in raw_name or "\\" in raw_name:
            raise ValueError("Folder name cannot contain a path separator")
        name = upload_name(raw_name)
        key = normalize_prefix(data.get("parent", "")) + name + "/"
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    try:
        s3.put_object(Bucket=S3_BUCKET, Key=key, Body=b"")
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"message": "Folder created", "key": key}), 201


@app.route("/api/files", methods=["POST"])
def upload_file():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "Choose a file to upload"}), 400
    try:
        key = normalize_prefix(request.form.get("prefix", "")) + upload_name(file.filename)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    try:
        s3.upload_fileobj(
            file,
            S3_BUCKET,
            key,
            ExtraArgs={"ContentType": file.content_type or "application/octet-stream"},
        )
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"message": "File uploaded", "key": key}), 201


@app.route("/api/files", methods=["PUT"])
def replace_file():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    file = request.files.get("file")
    try:
        key = validate_key(request.form.get("key"), allow_folder=False)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    if not file:
        return jsonify({"error": "Choose a replacement file"}), 400
    try:
        s3.upload_fileobj(
            file,
            S3_BUCKET,
            key,
            ExtraArgs={"ContentType": file.content_type or "application/octet-stream"},
        )
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"message": "File replaced", "key": key})


@app.route("/api/versioning", methods=["GET"])
def versioning_status():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    try:
        response = s3.get_bucket_versioning(Bucket=S3_BUCKET)
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"enabled": response.get("Status") == "Enabled"})


@app.route("/api/versioning", methods=["POST"])
def enable_versioning():
    """Enable S3 versioning only after an explicit request from the UI."""
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    try:
        s3.put_bucket_versioning(
            Bucket=S3_BUCKET,
            VersioningConfiguration={"Status": "Enabled"},
        )
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"message": "S3 versioning enabled"})


@app.route("/api/versions", methods=["GET"])
def list_versions():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    try:
        key = validate_key(request.args.get("key"), allow_folder=False)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    versions, key_marker, version_id_marker = [], None, None
    try:
        while True:
            params = {"Bucket": S3_BUCKET, "Prefix": key}
            if key_marker:
                params["KeyMarker"] = key_marker
                params["VersionIdMarker"] = version_id_marker
            response = s3.list_object_versions(**params)
            versions.extend(
                version_item(version)
                for version in response.get("Versions", [])
                if version["Key"] == key
            )
            if not response.get("IsTruncated"):
                break
            key_marker = response.get("NextKeyMarker")
            version_id_marker = response.get("NextVersionIdMarker")
            if not key_marker:
                break
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"versions": versions})


@app.route("/api/version-download", methods=["GET"])
def download_version():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    try:
        key = validate_key(request.args.get("key"), allow_folder=False)
        version_id = (request.args.get("version_id") or "").strip()
        if not version_id:
            raise ValueError("A version ID is required")
        name = key.rsplit("/", 1)[-1].replace('"', "")
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": key,
                "VersionId": version_id,
                "ResponseContentDisposition": f'attachment; filename="{name}"',
            },
            ExpiresIn=900,
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"url": url})


@app.route("/api/versions/restore", methods=["POST"])
def restore_version():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    data = request.get_json(silent=True) or {}
    try:
        key = validate_key(data.get("key"), allow_folder=False)
        version_id = str(data.get("version_id") or "").strip()
        if not version_id:
            raise ValueError("A version ID is required")
        s3.copy_object(
            Bucket=S3_BUCKET,
            Key=key,
            CopySource={"Bucket": S3_BUCKET, "Key": key, "VersionId": version_id},
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"message": "Version restored", "key": key})


@app.route("/api/download", methods=["GET"])
def download_file():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    try:
        key = validate_key(request.args.get("key"), allow_folder=False)
        name = key.rsplit("/", 1)[-1].replace('"', "")
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": S3_BUCKET,
                "Key": key,
                "ResponseContentDisposition": f'attachment; filename="{name}"',
            },
            ExpiresIn=900,
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"url": url})


@app.route("/api/open", methods=["GET"])
def open_file():
    """Create a temporary, inline S3 URL for opening a file in the browser."""
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    try:
        key = validate_key(request.args.get("key"), allow_folder=False)
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=900,
        )
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"url": url})


@app.route("/api/share", methods=["POST"])
def create_share_link():
    """Create an S3-only, time-limited view link; no database state is stored."""
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    data = request.get_json(silent=True) or {}
    try:
        key = validate_key(data.get("key"), allow_folder=False)
        expires_hours = int(data.get("expires_hours", 24))
        if not 1 <= expires_hours <= 168:
            raise ValueError("Link expiration must be between 1 hour and 7 days")
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=expires_hours * 60 * 60,
        )
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error) or "Invalid share link settings"}), 400
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"url": url, "expires_hours": expires_hours})


@app.route("/api/files", methods=["DELETE"])
def delete_file():
    bucket_error = require_bucket()
    if bucket_error:
        return bucket_error
    try:
        key = validate_key(request.args.get("key"))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    try:
        if not key.endswith("/"):
            s3.delete_object(Bucket=S3_BUCKET, Key=key)
        else:
            continuation = None
            while True:
                params = {"Bucket": S3_BUCKET, "Prefix": key}
                if continuation:
                    params["ContinuationToken"] = continuation
                response = s3.list_objects_v2(**params)
                objects = [{"Key": item["Key"]} for item in response.get("Contents", [])]
                for start in range(0, len(objects), 1000):
                    s3.delete_objects(Bucket=S3_BUCKET, Delete={"Objects": objects[start:start + 1000], "Quiet": True})
                if not response.get("IsTruncated"):
                    break
                continuation = response.get("NextContinuationToken")
                if not continuation:
                    break
    except (ClientError, BotoCoreError) as error:
        return s3_error(error)
    return jsonify({"message": "Deleted"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
