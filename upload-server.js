const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const UPLOAD_DIR = './uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function parseMultipart(data, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const endBoundaryBuffer = Buffer.from(`--${boundary}--`);
  
  let start = 0;
  let boundaryIndex = data.indexOf(boundaryBuffer, start);
  
  while (boundaryIndex !== -1) {
    const nextBoundaryIndex = data.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
    const endBoundaryIndex = data.indexOf(endBoundaryBuffer, boundaryIndex);
    
    if (nextBoundaryIndex === -1 && endBoundaryIndex === -1) break;
    
    const partEnd = nextBoundaryIndex !== -1 ? nextBoundaryIndex : endBoundaryIndex;
    const partData = data.slice(boundaryIndex + boundaryBuffer.length, partEnd);
    
    const headerEnd = partData.indexOf('\r\n\r\n');
    if (headerEnd !== -1) {
      const headers = partData.slice(0, headerEnd).toString();
      const content = partData.slice(headerEnd + 4, partData.length - 2);
      
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const nameMatch = headers.match(/name="([^"]+)"/);
      
      if (filenameMatch && nameMatch) {
        parts.push({
          name: nameMatch[1],
          filename: filenameMatch[1],
          content: content
        });
      }
    }
    
    boundaryIndex = nextBoundaryIndex;
  }
  
  return parts;
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

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body>
          <h1>File Upload Server</h1>
          <p>Server is running on port ${PORT}</p>
          <p>POST files to /upload</p>
          <p>Uploaded files are stored in: ${path.resolve(UPLOAD_DIR)}</p>
          <h3>Recent uploads:</h3>
          <ul>
            ${fs.readdirSync(UPLOAD_DIR).map(file => 
              `<li>${file} (${fs.statSync(path.join(UPLOAD_DIR, file)).size} bytes)</li>`
            ).join('')}
          </ul>
        </body>
      </html>
    `);
    return;
  }

  if ((req.method === 'POST' || req.method === 'PUT') && req.url === '/upload') {
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Content-Type must be multipart/form-data' }));
      return;
    }

    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing boundary in Content-Type' }));
      return;
    }

    let body = Buffer.alloc(0);
    
    req.on('data', chunk => {
      body = Buffer.concat([body, chunk]);
    });

    req.on('end', () => {
      try {
        const parts = parseMultipart(body, boundary);
        const uploadedFiles = [];

        for (const part of parts) {
          if (part.filename) {
            const safeFilename = part.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
            const timestamp = Date.now();
            const hash = crypto.createHash('md5').update(part.content).digest('hex').slice(0, 8);
            const finalFilename = `${timestamp}_${hash}_${safeFilename}`;
            const filePath = path.join(UPLOAD_DIR, finalFilename);
            
            fs.writeFileSync(filePath, part.content);
            
            uploadedFiles.push({
              originalName: part.filename,
              savedAs: finalFilename,
              size: part.content.length,
              path: filePath
            });
            
            console.log(`✅ Uploaded: ${part.filename} -> ${finalFilename} (${part.content.length} bytes)`);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Files uploaded successfully',
          files: uploadedFiles
        }));

      } catch (error) {
        console.error('Upload error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Upload processing failed', details: error.message }));
      }
    });

    req.on('error', (error) => {
      console.error('Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Request failed', details: error.message }));
    });

    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`🚀 Upload server running at http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${path.resolve(UPLOAD_DIR)}`);
  console.log(`📤 Upload endpoint: http://localhost:${PORT}/upload`);
  console.log(`🌐 Web interface: http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});
