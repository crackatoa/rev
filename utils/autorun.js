const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

module.exports = function(action = 'install') {
  const userHome = process.env.HOME;
  const agentDir = path.join(userHome, "Library", "LaunchAgents");
  const plistPath = path.join(agentDir, "com.example.autorun.plist");
  const scriptPath = "/Users/Shared/test.sh";
  const logPath = "/Users/Shared/test.log";

  if (action === 'remove' || action === 'uninstall') {
    try {
      if (fs.existsSync(plistPath)) {
        execSync(`launchctl unload "${plistPath}"`);
        fs.unlinkSync(plistPath);
        console.log("✅ Autorun removed successfully.");
      }
      if (fs.existsSync(scriptPath)) {
        fs.unlinkSync(scriptPath);
        console.log("✅ Script file cleaned up.");
      }
    } catch (err) {
      console.error("⚠️ Failed to remove autorun:", err.message);
    }
    return;
  }

  if (action === 'status') {
    const plistExists = fs.existsSync(plistPath);
    const scriptExists = fs.existsSync(scriptPath);
    
    console.log(`📋 Autorun Status:`);
    console.log(`   Plist: ${plistExists ? '✅ Installed' : '❌ Not installed'}`);
    console.log(`   Script: ${scriptExists ? '✅ Present' : '❌ Missing'}`);
    
    if (fs.existsSync(logPath)) {
      const logContent = fs.readFileSync(logPath, 'utf8');
      console.log(`   Log entries: ${logContent.split('\n').filter(l => l.trim()).length}`);
      console.log(`   Last entries:`);
      logContent.split('\n').slice(-3).forEach(line => {
        if (line.trim()) console.log(`     ${line}`);
      });
    }
    return;
  }

  console.log("🔧 Setting up autorun...");

  const scriptContent = `#!/bin/bash
echo "✅ test.sh executed by $(whoami) at $(date)" >> ${logPath}
`;
  fs.writeFileSync(scriptPath, scriptContent, { mode: 0o755 });

  fs.mkdirSync(agentDir, { recursive: true });

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" 
"http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.example.autorun</string>

    <key>ProgramArguments</key>
    <array>
      <string>/bin/bash</string>
      <string>${scriptPath}</string>
    </array>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
  </dict>
</plist>`;

  fs.writeFileSync(plistPath, plistContent);

  try {
    execSync(`launchctl load "${plistPath}"`);
    console.log("✅ Autorun installed successfully.");
  } catch (err) {
    console.error("⚠️ Failed to load LaunchAgent:", err.message);
  }

  console.log(`→ Script: ${scriptPath}`);
  console.log(`→ Plist:  ${plistPath}`);
  console.log(`→ Log:    ${logPath}`);
  
  console.log("\n📖 Usage:");
  console.log("  node index.js autorun         # Install autorun");
  console.log("  node index.js autorun status  # Check status");
  console.log("  node index.js autorun remove  # Remove autorun");
};
