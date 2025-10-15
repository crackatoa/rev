const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

module.exports = function (filePath, uploadUrl, options = {}) {
  if (!filePath || !uploadUrl) {
    console.error('Usage: mycli upload <filePath> <uploadUrl> [options]');
    console.error('Options: --field=<fieldName> --method=<POST|PUT>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const fileSize = fs.statSync(filePath).size;
  const fieldName = options.field || 'file';
  const method = options.method || 'POST';

  console.log(`📤 Uploading ${fileName} (${fileSize} bytes) -> ${uploadUrl}`);

  const url = new URL(uploadUrl);
  const client = url.protocol === 'https:' ? https : http;

  const boundary = '----formdata-boundary-' + Math.random().toString(36);
  const fileStream = fs.createReadStream(filePath);

  const formDataStart = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"`,
    `Content-Type: application/octet-stream`,
    '',
    ''
  ].join('\r\n');

  const formDataEnd = `\r\n--${boundary}--\r\n`;

  const contentLength = Buffer.byteLength(formDataStart) + fileSize + Buffer.byteLength(formDataEnd);

  const requestOptions = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: method,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': contentLength,
      'User-Agent': 'CLI-Upload-Tool/1.0'
    }
  };

  const request = client.request(requestOptions, (response) => {
    let responseBody = '';
    
    response.on('data', (chunk) => {
      responseBody += chunk;
    });

    response.on('end', () => {
      if (response.statusCode >= 200 && response.statusCode < 300) {
        console.log(`✅ Upload successful: ${response.statusCode}`);
        if (responseBody) {
          console.log('Response:', responseBody);
        }
      } else {
        console.error(`❌ Upload failed: ${response.statusCode} ${response.statusMessage}`);
        if (responseBody) {
          console.error('Error response:', responseBody);
        }
      }
    });
  });

  request.on('error', (err) => {
    console.error('❌ Upload error:', err.message);
  });

  request.write(formDataStart);

  fileStream.on('data', (chunk) => {
    request.write(chunk);
  });

  fileStream.on('end', () => {
    request.write(formDataEnd);
    request.end();
  });

  fileStream.on('error', (err) => {
    console.error('❌ File read error:', err.message);
    request.destroy();
  });
};
