const { spawnSync, execSync } = require("child_process");
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
            timeout: opts.timeout || 30000,
            maxBuffer: 10 * 1024 * 1024,
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
            fs.mkdirSync(dirPath, { recursive: true, mode: 0o755 });
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

module.exports = function(installPath) {
    const defaultPath = path.join(process.env.HOME || "/tmp", "tools");
    const targetDir = installPath || defaultPath;
    const laZagneDir = path.join(targetDir, "LaZagne");
    
    console.log("🔧 Starting LaZagne installation...");
    console.log(`📂 Target directory: ${targetDir}`);
    
    const prereqs = checkPrerequisites();
    console.log("📋 Checking prerequisites:");
    console.log(`  Git: ${prereqs.git ? '✅' : '❌'}`);
    console.log(`  Python3: ${prereqs.python3 ? '✅' : '❌'}`);
    console.log(`  Pip: ${prereqs.pip ? '✅' : '❌'}`);
    
    const missing = Object.entries(prereqs).filter(([_, available]) => !available).map(([tool]) => tool);
    if (missing.length > 0) {
        console.error(`❌ Missing prerequisites: ${missing.join(', ')}`);
        return `Failed: Missing ${missing.join(', ')}`;
    }
    
    if (!ensureDirectoryExists(targetDir)) {
        console.error("❌ Failed to create target directory");
        return "Failed: Directory creation error";
    }
    
    if (exists(laZagneDir)) {
        console.log("📁 LaZagne directory already exists");
        const choice = process.argv.includes('--force') ? 'overwrite' : 'skip';
        
        if (choice === 'skip') {
            console.log("⏭️  Skipping clone (use --force to overwrite)");
        } else {
            console.log("🗑️  Removing existing directory");
            try {
                fs.rmSync(laZagneDir, { recursive: true, force: true });
            } catch (e) {
                console.error("❌ Failed to remove existing directory");
                return "Failed: Cleanup error";
            }
        }
    }
    
    if (!exists(laZagneDir)) {
        console.log("📥 Cloning LaZagne repository...");
        process.chdir(targetDir);
        
        const cloneResult = safeRun([
            "git", "clone", 
            "https://github.com/AlessandroZ/LaZagne.git"
        ], { timeout: 60000 });
        
        if (cloneResult.rc !== 0) {
            console.error("❌ Git clone failed");
            return "Failed: Clone error";
        }
        
        console.log("✅ Repository cloned successfully");
    }
    
    const requirementsPath = path.join(laZagneDir, "requirements.txt");
    if (exists(requirementsPath)) {
        console.log("📦 Installing Python dependencies...");
        process.chdir(laZagneDir);
        
        const pipCmd = prereqs.pip && safeRun(["which", "pip"], { silent: true }).rc === 0 ? "pip" : "pip3";
        const installResult = safeRun([
            pipCmd, "install", "-r", "requirements.txt"
        ], { timeout: 120000 });
        
        if (installResult.rc !== 0) {
            console.error("❌ Pip install failed");
            return "Failed: Dependencies installation error";
        }
        
        console.log("✅ Dependencies installed successfully");
    } else {
        console.log("⚠️  Requirements file not found, skipping pip install");
    }
    
    const platform = os.platform();
    let laZagnePath;
    
    switch (platform) {
        case 'darwin':
            laZagnePath = path.join(laZagneDir, "Mac", "laZagne.py");
            break;
        case 'linux':
            laZagnePath = path.join(laZagneDir, "Linux", "laZagne.py");
            break;
        case 'win32':
            laZagnePath = path.join(laZagneDir, "Windows", "laZagne.exe");
            break;
        default:
            console.log("⚠️  Unknown platform, defaulting to Linux");
            laZagnePath = path.join(laZagneDir, "Linux", "laZagne.py");
    }
    
    if (exists(laZagnePath)) {
        console.log("🧪 Testing LaZagne installation...");
        process.chdir(path.dirname(laZagnePath));
        
        const testResult = safeRun([
            "python3", path.basename(laZagnePath), "--help"
        ], { timeout: 10000, silent: true });
        
        if (testResult.rc === 0) {
            console.log("✅ LaZagne is working correctly");
        } else {
            console.log("⚠️  LaZagne test failed, but installation completed");
        }
    } else {
        console.log("⚠️  LaZagne executable not found for this platform");
    }
    
    console.log("📋 Installation Summary:");
    console.log(`  Installation path: ${laZagneDir}`);
    console.log(`  Platform: ${platform}`);
    console.log(`  LaZagne path: ${laZagnePath}`);
    console.log("");
    console.log("🚀 Usage examples:");
    console.log(`  cd ${path.dirname(laZagnePath)}`);
    console.log(`  python3 ${path.basename(laZagnePath)} all`);
    console.log(`  python3 ${path.basename(laZagnePath)} browsers`);
    
    return `LaZagne installed to: ${laZagneDir}`;
};