#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');

// ===== Load all function modules dynamically =====
const utilsDir = path.join(__dirname, 'utils');
const utils = {};

fs.readdirSync(utilsDir)
  .filter(f => f.endsWith('.js'))
  .forEach(file => {
    const name = path.basename(file, '.js');
    utils[name] = require(path.join(utilsDir, file));
  });

// ====== Simple web server ======
const PORT = 8888;
const publicDir = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    // e.g. /api/greet?args=Alice
    const [, , command] = req.url.split('/');
    const urlParams = new URL(req.url, `http://${req.headers.host}`);
    const args = urlParams.searchParams.get('args')?.split(' ') || [];

    if (utils[command]) {
      try {
        const result = utils[command](...args);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: 'Command not found' }));
    }
    return;
  }

  // serve static files
  let filePath = path.join(publicDir, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    } else {
      const ext = path.extname(filePath).toLowerCase();
      const type =
        ext === '.html' ? 'text/html' :
        ext === '.js'   ? 'text/javascript' :
        ext === '.css'  ? 'text/css' :
        'text/plain';
      res.writeHead(200, { 'Content-Type': type });
      res.end(content);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Web server running at http://localhost:${PORT}`);
});

// ====== CLI mode still works ======
const [,, option, ...args] = process.argv;

if (option && utils[option]) {
  try {
    utils[option](...args);
  } catch (err) {
    console.error('❌ Error running command:', err.message);
  }
} else if (option) {
  console.error(`Unknown command: ${option}`);
  console.log('');
  utils.help();
}
