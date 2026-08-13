# S3 File Manager API
A simple REST API for managing files in an AWS S3 bucket. This API allows you to upload, download, list, and delete files in your S3 bucket.

## Endpoints

### Health Check
- `GET /` - Check if the API is running.

### File Operations
- `POST /files` - Upload a file to S3.
- `GET /files` - List all files in the S3 bucket.
- `GET /files/<filename>` - Download a file from S3.
- `PUT /files/<filename>` - Replace an existing file in S3.
- `DELETE /files/<filename>` - Delete a file from S3.

