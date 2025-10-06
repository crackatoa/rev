const fs = require('fs');
const path = require('path');

module.exports = function() {
  const utilsDir = path.join(__dirname);
  const commands = fs.readdirSync(utilsDir)
    .filter(f => f.endsWith('.js'))
    .map(f => path.basename(f, '.js'))
    .sort();

  console.log('📚 Available commands:');
  console.log('');
  commands.forEach(cmd => {
    console.log(`  ${cmd}`);
  });
  console.log('');
  console.log('Usage: node index.js <command> [args]');
  console.log('Example: node index.js greet Alice');
};
