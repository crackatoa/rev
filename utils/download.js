const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

module.exports = function (url, outputFile) {
  if (!url) {
    console.error('Usage: mycli download <url> [outputFile]');
    process.exit(1);
  }

  const fileName = outputFile || path.basename(url);
  const file = fs.createWriteStream(fileName);

  const client = url.startsWith('https') ? https : http;

  console.log(`Downloading ${url} -> ${fileName}`);

  client.get(url, response => {
    if (response.statusCode !== 200) {
      console.error(`Failed to download. Status: ${response.statusCode}`);
      response.resume(); // discard data
      return;
    }

    response.pipe(file);

    file.on('finish', () => {
      file.close(() => {
        console.log(`✅ Download complete: ${fileName}`);
      });
    });
  }).on('error', err => {
    fs.unlink(fileName, () => {}); // cleanup if error
    console.error('❌ Error:', err.message);
  });
};
