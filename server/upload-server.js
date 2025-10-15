const http = require('http');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('crypto').randomUUID || (() => Math.random().toString(36));

const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function parseMultipart(req, callback) {
  let body = Buffer.alloc(0);
  
  req.on('data', chunk => {
    body = Buffer.concat([body, chunk]);
  });
  
  req.on('end', () => {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('multipart/form-data')) {
      return callback(new Error('Invalid content type'));
    }
    
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return callback(new Error('No boundary found'));
    }
    
    const parts = body.toString('binary').split(`--${boundary}`);
    
    for (let part of parts) {
      if (part.includes('Content-Disposition: form-data')) {
        const lines = part.split('\r\n');
        let filename = null;
        let fieldname = null;
        
        for (let line of lines) {
          if (line.includes('Content-Disposition')) {
            const filenameMatch = line.match(/filename="([^"]+)"/);
            const fieldnameMatch = line.match(/name="([^"]+)"/);
            if (filenameMatch) filename = filenameMatch[1];
            if (fieldnameMatch) fieldname = fieldnameMatch[1];
          }
        }
        
        if (filename) {
          const contentStart = part.indexOf('\r\n\r\n') + 4;
          const contentEnd = part.lastIndexOf('\r\n');
          const fileContent = part.slice(contentStart, contentEnd);
          
          return callback(null, {
            filename: filename,
            fieldname: fieldname,
            content: Buffer.from(fileContent, 'binary')
          });
        }
      }
    }
    
    callback(new Error('No file found in upload'));
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.method === 'POST' || req.method === 'PUT') {
    if (req.url === '/upload' || req.url === '/') {
      console.log(`📥 Receiving ${req.method} upload from ${req.connection.remoteAddress}`);
      
      parseMultipart(req, (err, file) => {
        if (err) {
          console.error('❌ Upload error:', err.message);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: err.message 
          }));
          return;
        }
        
        const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const savedFilename = `${timestamp}_${sanitizedFilename}`;
        const filepath = path.join(UPLOAD_DIR, savedFilename);
        
        fs.writeFile(filepath, file.content, (writeErr) => {
          if (writeErr) {
            console.error('❌ File save error:', writeErr.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              success: false, 
              error: 'Failed to save file' 
            }));
            return;
          }
          
          const fileSize = file.content.length;
          console.log(`✅ File saved: ${savedFilename} (${fileSize} bytes)`);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'File uploaded successfully',
            filename: savedFilename,
            originalName: file.filename,
            size: fileSize,
            uploadTime: new Date().toISOString()
          }));
        });
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Not found' }));
    }
  } else if (req.method === 'GET') {
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Upload Server</title>
        </head>
        <body>
          <h1>🚀 Upload Server Running</h1>
          <p>Server is ready to receive file uploads</p>
          <p>Upload endpoint: POST /upload</p>
          <p>Uploaded files are stored in: ./uploads/</p>
          
          <h2>Test Upload</h2>
          <form action="/upload" method="post" enctype="multipart/form-data">
            <input type="file" name="file" required>
            <button type="submit">Upload</button>
          </form>
        </body>
        </html>
      `);
    } else if (req.url === '/status') {
      const uploadedFiles = fs.readdirSync(UPLOAD_DIR).map(file => {
        const stats = fs.statSync(path.join(UPLOAD_DIR, file));
        return {
          filename: file,
          size: stats.size,
          uploaded: stats.mtime
        };
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'running',
        uploadCount: uploadedFiles.length,
        files: uploadedFiles
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  } else {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Upload server running at http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${UPLOAD_DIR}`);
  console.log(`📝 Web interface: http://localhost:${PORT}`);
  console.log(`📊 Status endpoint: http://localhost:${PORT}/status`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
});
