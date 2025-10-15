const fs = require('fs');
const path = require('path');

module.exports = function(subcmd) {
  const utilsDir = path.join(__dirname);
  
  if (subcmd) {
    const commandMap = {
      'nc': 'rev-nc',
      'nc-obs': 'rev-nc-obs',
      'direct': 'rev-direct',
      'direct-obs': 'rev-direct-obs'
    };
    
    const targetCommand = commandMap[subcmd];
    if (targetCommand) {
      try {
        const targetPath = path.join(utilsDir, `${targetCommand}.js`);
        if (fs.existsSync(targetPath)) {
          require(targetPath);
          console.log(`✅ Executed ${targetCommand}`);
          return `Executed ${targetCommand}`;
        } else {
          console.log(`❌ Command ${targetCommand} not found`);
          return `Command ${targetCommand} not found`;
        }
      } catch (err) {
        console.log(`❌ Error executing ${targetCommand}:`, err.message);
        return `Error executing ${targetCommand}: ${err.message}`;
      }
    } else {
      console.log(`❌ Unknown subcommand: ${subcmd}`);
      return `Unknown subcommand: ${subcmd}`;
    }
  }
  
  const commands = fs.readdirSync(utilsDir)
    .filter(f => f.endsWith('.js') && !f.startsWith('rev-'))
    .map(f => path.basename(f, '.js'))
    .sort();

  const helpText = [
    '📚 Available commands:',
    '',
    ...commands.map(cmd => `  ${cmd}`),
    '',
    '🔧 Special help commands:',
    '  help nc         - Execute reverse shell (netcat)',
    '  help nc-obs     - Execute obfuscated netcat',
    '  help direct     - Execute direct connection',
    '  help direct-obs - Execute obfuscated direct',
    '',
    'Usage: node index.js <command> [args]',
    'Example: node index.js greet Alice'
  ].join('\n');

  console.log(helpText);
  return helpText;
};
