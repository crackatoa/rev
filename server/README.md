# Upload Server

A simple HTTP server that accepts file uploads from the CLI upload tool.

## Features

- ✅ Accepts multipart/form-data uploads
- ✅ Sanitizes filenames for security
- ✅ Timestamps uploaded files
- ✅ Web interface for testing
- ✅ Status endpoint for monitoring
- ✅ CORS support
- ✅ Secure file handling

## Quick Start

### Start the server:
```bash
cd server
node start.js
```

### Or run directly:
```bash
node server/upload-server.js
```

## Endpoints

- `GET /` - Web interface with upload form
- `POST /upload` - File upload endpoint  
- `GET /status` - Server status and uploaded files list
- `PUT /upload` - Alternative upload endpoint

## Usage with CLI Tool

```bash
# Upload a file to the server
node index.js upload myfile.txt http://localhost:3000/upload

# Upload to specific endpoint
node index.js upload document.pdf http://localhost:3000/

# Upload with custom field name
node index.js upload data.json http://localhost:3000/upload
```

## Directory Structure

```
server/
├── upload-server.js    # Main server code
├── start.js           # Server startup script
├── uploads/           # Directory for uploaded files (created automatically)
└── README.md          # This file
```

## Security Features

- Filename sanitization to prevent directory traversal
- File size monitoring
- Timestamp-based naming to prevent conflicts
- Input validation for multipart data
- CORS headers for cross-origin requests

## Configuration

Edit `upload-server.js` to change:
- Port number (default: 3000)
- Upload directory (default: ./uploads)
- File size limits
- Allowed file types
