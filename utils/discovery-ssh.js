const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function header(title) {
    return [
        "====================================================================",
        title,
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
            timeout: opts.timeout || 5000,
            maxBuffer: 1024 * 1024
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

module.exports = function (outputPath) {
    const defaultPath = path.join(process.env.HOME || "/tmp", "reports", "ssh_discovery_report.txt");
    const sanitizedPath = outputPath ? sanitizeFilename(outputPath) : defaultPath;
    const OUTFILE = path.resolve(sanitizedPath);

    if (!ensureDirectoryExists(OUTFILE)) {
        console.error("❌ Failed to create output directory");
        throw new Error("Directory creation failed");
    }

    const HOSTNAME = safeRunStr(["hostname"]) || "unknown";
    const USER = safeRunStr(["whoami"]) || process.env.USER || "unknown";
    const TIMESTAMP = new Date().toISOString();

    console.log("🔍 Starting SSH discovery scan...");
    console.log(`📊 Target output: ${OUTFILE}`);

    let out = [];
    out.push("SSH Discovery Report");
    out.push(`collected_at_utc: ${TIMESTAMP}`);
    out.push(`host: ${HOSTNAME}`);
    out.push(`user: ${USER}`);
    out.push("");

    out.push(header("SYSTEM USERS"));
    if (exists("/etc/passwd")) {
        try {
            const passwdContent = fs.readFileSync("/etc/passwd", "utf8");
            const users = passwdContent.split("\n")
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split(":");
                    if (parts.length >= 7) {
                        const username = parts[0];
                        const uid = parts[2];
                        const homeDir = parts[5];
                        const shell = parts[6];
                        return { username, uid, homeDir, shell };
                    }
                    return null;
                })
                .filter(user => user && (parseInt(user.uid) >= 500 || user.username === "root"));

            out.push("Real users (UID >= 500 or root):");
            users.forEach(user => {
                out.push(`${user.username} (UID: ${user.uid}, Home: ${user.homeDir}, Shell: ${user.shell})`);
            });
        } catch (e) {
            out.push("Permission denied reading /etc/passwd");
        }
    }
    out.push("");

    out.push(header("SSH DIRECTORIES"));
    const homeDirectories = ["/root", "/home"];

    homeDirectories.forEach(baseDir => {
        if (exists(baseDir)) {
            if (baseDir === "/root") {
                out.push("Checking /root/.ssh:");
                const rootSshDir = "/root/.ssh";
                if (exists(rootSshDir)) {
                    const listing = safeRunStr(["ls", "-la", rootSshDir]);
                    out.push(listing || "No permission or empty");
                } else {
                    out.push("Directory not found");
                }
                out.push("");
            } else {
                out.push("Checking /home user directories:");
                const homeListing = safeRunStr(["ls", "-la", "/Users"]);
                if (homeListing) {
                    const userDirs = homeListing.split("\n")
                        .filter(line => line.startsWith("d"))
                        .map(line => line.split(/\s+/).pop())
                        .filter(dir => dir && dir !== "." && dir !== ".." && dir.length > 0);

                    userDirs.forEach(userDir => {
                        const sshPath = path.join("/Users", userDir, ".ssh");
                        out.push(`User: ${userDir}`);

                        if (exists(sshPath)) {
                            try {
                                const files = fs.readdirSync(sshPath);
                                if (files.length > 0) {
                                    files.forEach(f => {
                                        const fullPath = path.join(sshPath, f);
                                        out.push(`File: ${fullPath}`);

                                        try {
                                            const content = fs.readFileSync(fullPath, "utf8");
                                            out.push(content.trim() || "(empty file)");
                                        } catch (err) {
                                            out.push(`(cannot read file: ${err.message})`);
                                        }

                                        out.push(""); // spacing between files
                                    });
                                } else {
                                    out.push("Empty .ssh directory");
                                }
                            } catch (err) {
                                out.push("No permission or error: " + err.message);
                            }
                        } else {
                            out.push("No .ssh directory");
                        }

                        out.push(""); // spacing between users
                    });


                }
            }
        }
    });

    out.push(header("SSH CONFIG FILES"));
    const sshConfigs = [
        "/etc/ssh/sshd_config",
        "/etc/ssh/ssh_config",
        path.join(process.env.HOME || "", ".ssh", "config")
    ];

    sshConfigs.forEach(configPath => {
        if (exists(configPath)) {
            out.push(`Config: ${configPath}`);
            const permissions = safeRunStr(["ls", "-l", configPath]);
            out.push(permissions);
            out.push("");
        }
    });

    out.push(header("SSH KNOWN HOSTS"));
    const knownHostsFiles = [
        "/etc/ssh/ssh_known_hosts",
        path.join(process.env.HOME || "", ".ssh", "known_hosts")
    ];

    knownHostsFiles.forEach(hostsFile => {
        if (exists(hostsFile)) {
            out.push(`Known hosts: ${hostsFile}`);
            const permissions = safeRunStr(["ls", "-l", hostsFile]);
            out.push(permissions);
            try {
                const content = fs.readFileSync(hostsFile, "utf8");
                out.push("First 10 entries:");
                out.push(headLines(content, 10));
            } catch (e) {
                out.push("Permission denied reading file");
            }
            out.push("");
        }
    });

    out.push(header("SSH AGENT STATUS"));
    out.push(`SSH_AGENT_PID: ${process.env.SSH_AGENT_PID || "not set"}`);
    out.push(`SSH_AUTH_SOCK: ${process.env.SSH_AUTH_SOCK || "not set"}`);

    if (process.env.SSH_AUTH_SOCK) {
        const sshAdd = safeRunStr(["ssh-add", "-l"]);
        out.push("Loaded SSH keys:");
        out.push(sshAdd || "No keys loaded or ssh-add not available");
    }
    out.push("");

    out.push(header("SSH PROCESSES"));
    const sshProcesses = safeRunStr(["ps", "aux"]);
    if (sshProcesses) {
        const sshLines = sshProcesses.split("\n").filter(line =>
            line.includes("ssh") || line.includes("sshd")
        );
        out.push("SSH-related processes:");
        out.push(headLines(sshLines.join("\n"), 20));
    }
    out.push("");

    out.push(header("SSH LISTENING PORTS"));
    const netstat = safeRunStr(["netstat", "-tlnp"]);
    if (netstat) {
        const sshPorts = netstat.split("\n").filter(line =>
            line.includes(":22 ") || line.includes("ssh")
        );
        out.push("SSH listening ports:");
        out.push(sshPorts.join("\n") || "No SSH ports found");
    }
    out.push("");

    out.push(header("AUTHORIZED KEYS"));
    out.push("Current user authorized_keys:");
    const authKeysPath = path.join(process.env.HOME || "", ".ssh", "authorized_keys");
    if (exists(authKeysPath)) {
        const permissions = safeRunStr(["ls", "-l", authKeysPath]);
        out.push(permissions);
        try {
            const content = fs.readFileSync(authKeysPath, "utf8");
            const keyCount = content.split("\n").filter(line => line.trim()).length;
            out.push(`Number of authorized keys: ${keyCount}`);
            out.push("Key types:");
            content.split("\n")
                .filter(line => line.trim())
                .forEach((line, index) => {
                    const keyType = line.split(" ")[0];
                    if (keyType) {
                        out.push(`Key ${index + 1}: ${keyType}`);
                    }
                });
        } catch (e) {
            out.push("Permission denied reading authorized_keys");
        }
    } else {
        out.push("No authorized_keys file found");
    }
    out.push("");

    out.push(header("SUMMARY"));
    out.push([
        "- Check for weak SSH configurations",
        "- Review authorized_keys permissions",
        "- Verify SSH key management practices",
        "- Monitor SSH agent usage",
        "- Audit SSH access logs"
    ].join("\n"));
    out.push("");
    out.push("Notes: This scan only checks readable SSH configurations and does not access private keys.");
    out.push("");

    try {
        fs.writeFileSync(OUTFILE, out.join("\n"), { encoding: "utf8", mode: 0o600 });
        console.log(`✅ SSH discovery report written to: ${OUTFILE}`);
        console.log(`📁 File size: ${fs.statSync(OUTFILE).size} bytes`);
        return `SSH report generated: ${OUTFILE}`;
    } catch (e) {
        console.error(`❌ Failed to write report: ${e.message}`);
        throw e;
    }
};