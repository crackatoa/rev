const upload = require('./utils/upload');

console.log('=== Upload Examples ===\n');

console.log('Example 1: Basic file upload');
console.log('Command: node index.js upload ./README.md https://httpbin.org/post\n');

console.log('Example 2: Upload with custom field name');
console.log('Command: node index.js upload ./package.json https://httpbin.org/post --field=document\n');

console.log('Example 3: Upload using PUT method');
console.log('Command: node index.js upload ./index.js https://httpbin.org/put --method=PUT\n');

console.log('Example 4: Direct function call');
upload('./README.md', 'https://httpbin.org/post', { field: 'readme' });
