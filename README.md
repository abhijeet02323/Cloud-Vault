# CloudVault

### Cloud File Management & Collaboration Platform

CloudVault is a **Google Drive-inspired cloud storage platform** that provides secure file management, directory organization, file versioning, and shareable links.

The application uses **Amazon S3 as the primary object storage**, while **GitHub OAuth 2.0 authentication** provides secure user authentication. Files can be uploaded, organized into directories, versioned automatically, downloaded through secure URLs, and shared through time-limited links.

---

## ✨ Features

### 🔐 Authentication

- GitHub OAuth 2.0 authentication
- Secure user login through GitHub
- No need to store GitHub passwords
- Authenticated access to the CloudVault application
- User-specific cloud storage

### ☁️ Amazon S3 Object Storage

CloudVault uses **Amazon S3** for reliable and scalable object storage.

- Upload files directly to S3
- Download files from S3
- Delete files
- Replace/update existing files
- Organize objects using directory/prefix structures
- Keep S3 objects private
- Generate secure presigned URLs

### 📁 Directory Management

- Create new folders
- Open folders
- Navigate through nested directories
- Breadcrumb navigation
- Upload files into the current directory
- Delete directories
- Google Drive-inspired file and folder interface

### 🔄 File Versioning

CloudVault uses **Amazon S3 Versioning** to maintain multiple versions of files.

- Automatically maintain previous file versions
- View version history
- Identify the latest version
- View version size and modification time
- Download previous versions
- Restore/retrieve older file versions

Example:

```text
architecture.pdf

├── Version 3 — Current
├── Version 2
└── Version 1
```

### 🔗 File Sharing

CloudVault provides secure, time-limited file sharing.

Users can generate a shareable link for a file and specify how long the link remains active.

Supported durations include:

- 1 hour
- 24 hours
- 7 days
- 30 days

Example:

```text
Share File

File: architecture.pdf

Permission: Download

Expiration: 24 hours

Share Link:
https://your-domain.com/shared/xxxxx
```

Once the selected duration expires, the share link becomes invalid.

CloudVault uses **token-based sharing and S3 presigned URLs** rather than making the S3 bucket publicly accessible.

### 📤 File Upload

- Standard file upload
- Drag-and-drop upload
- Browse local files
- Upload progress indicator
- Upload percentage
- Upload directly into the currently opened directory

### 📥 File Download

- Secure file downloads
- S3 presigned URLs
- Version-specific downloads
- Browser-based downloads

### 🔍 File Search

- Search files by name
- Filter the current file listing
- Quickly locate stored objects

### 🎨 User Interface

CloudVault provides a modern Google Drive-inspired interface with:

- Sidebar navigation
- My Drive
- File and folder grid
- Breadcrumb navigation
- Context menus
- Upload interface
- Search
- Modal dialogs
- Toast notifications
- Loading states
- Empty states
- Responsive design

---

# 🏗️ Architecture

```text
                         CloudVault
                             │
                             ▼
                    ┌─────────────────┐
                    │   Web Frontend  │
                    │   HTML/CSS/JS   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │    Flask API    │
                    │     Backend     │
                    └───────┬─────────┘
                            │
              ┌─────────────|
              │             │           
              ▼             ▼           
        GitHub OAuth      Amazon S3     
          2.0 Auth      Object Storage
                            │
                  ┌─────────┼─────────┐
                  │         │         │
                Files    Versions   Objects
                            │
                            ▼
                     Presigned URLs
                            │
                            ▼
                       File Sharing
```

---

# 🧰 Technology Stack

## Frontend

- HTML5
- CSS3
- JavaScript
- Responsive UI

## Backend

- Python
- Flask
- REST API

## Cloud

- Amazon S3
- AWS IAM
- S3 Versioning
- S3 Presigned URLs

## Authentication

- GitHub OAuth 2.0
## AWS SDK

- Boto3

---

# ⚙️ Installation

## 1. Clone the repository

```bash
git clone https://github.com/abhijeet02323/Cloud-Vault.git

cd Cloud-Vault
```

## 2. Create a virtual environment

```bash
python -m venv .venv
```

Activate it:

### Linux/macOS

```bash
source .venv/bin/activate
```

### Windows

```powershell
.venv\Scripts\activate
```

## 3. Install dependencies

```bash
pip install -r requirements.txt
```

---

# ☁️ AWS S3 Configuration

Create an S3 bucket in AWS.

Enable:

```text
Bucket Versioning: Enabled
```

Configure appropriate IAM permissions for the application.

Example permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

For production deployments, use an **IAM role** instead of long-lived AWS access keys whenever possible.

---

# 🔐 Environment Variables

Create a `.env` file:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=ap-south-1
S3_BUCKET_NAME=your_bucket_name

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

> Never commit `.env` or AWS credentials to GitHub.

---

# 🔑 GitHub OAuth 2.0 Setup

Create an OAuth application in your GitHub developer settings.

Configure the callback URL according to your deployment.

For local development, for example:

```text
http://127.0.0.1:5000/auth/github/callback
```

Add the generated credentials to `.env`:

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
```

---

# ▶️ Running the Application

Start the Flask server:

```bash
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

---

# 🔌 Core API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Cloud-Vault frontend |
| `GET` | `/api/files` | List files/folders |
| `POST` | `/api/files` | Upload file |
| `DELETE` | `/api/files` | Delete file/folder |
| `POST` | `/api/folders` | Create folder |
| `GET` | `/api/download` | Generate download URL |
| `GET` | `/api/versions` | Get file versions |
| `GET` | `/api/version-download` | Download specific version |
| `POST` | `/api/share` | Create share link |
| `GET` | `/shared/<token>` | Access shared file |

---

# 🔒 Security

CloudVault is designed around private cloud storage.

Key security principles include:

- S3 bucket remains private
- Temporary presigned URLs
- Time-limited share links
- Token-based file sharing
- GitHub OAuth 2.0 authentication
- AWS IAM permissions
- Environment-based secrets
- No AWS credentials stored in source code

---


# 🎯 Project Goals

CloudVault aims to demonstrate practical knowledge of:

- Cloud computing
- AWS S3
- Object storage
- REST API development
- Python backend development
- Flask
- OAuth 2.0 authentication
- Cloud security
- Presigned URLs
- Object versioning
- File management
- Web application development
- Database integration
- Scalable cloud architecture
