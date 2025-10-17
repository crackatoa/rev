const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

function header(title) {
  return [
    "====================================================================",
    title,
    "--------------------------------------------------------------------"
  ].join("\n") + "\n";
}

function safeRun(cmdArr, opts = {}) {
  try {
    const proc = spawnSync(cmdArr[0], cmdArr.slice(1), {
      encoding: "utf8",
      timeout: opts.timeout || 10000,
      maxBuffer: 10 * 1024 * 1024
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
  try { return fs.existsSync(p); } catch (e) { return false; }
}

function lsSafe(p) {
  try {
    return fs.readdirSync(p).slice(0, 200).map(f => f).join("\n");
  } catch (e) {
    return String(e);
  }
}

function statSafe(p) {
  try {
    return fs.statSync(p).toString();
  } catch (e) {
    return String(e);
  }
}

function headLines(text, n=200) {
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  return lines.slice(0, n).join("\n");
}

module.exports = function(outputFile) {
  const OUTFILE = outputFile || "discovery_report.txt";
  const HOSTNAME = safeRunStr(["hostname"]) || "unknown";
  const USER = safeRunStr(["whoami"]) || process.env.USER || process.env.LOGNAME || "unknown";
  const TIMESTAMP = new Date().toISOString();

  console.log("🔍 Starting Linux privilege escalation discovery...");
  console.log(`📊 Target output: ${OUTFILE}`);

  let out = [];
  out.push("Linux Discovery Report");
  out.push(`collected_at_utc: ${TIMESTAMP}`);
  out.push(`host: ${HOSTNAME}`);
  out.push(`user: ${USER}`);
  out.push("");

  out.push(header("BASIC SYSTEM"));
  out.push("uname -a:");
  out.push(safeRunStr(["uname", "-a"]));
  out.push("");
  out.push("lsb_release (if present):");
  out.push(safeRunStr(["lsb_release", "-a"]));
  out.push("");
  if (exists("/etc/os-release")) {
    out.push("cat /etc/os-release:");
    try {
      out.push(headLines(fs.readFileSync("/etc/os-release", "utf8"), 200));
    } catch (e) {
      out.push(String(e));
    }
    out.push("");
  }

  out.push(header("USER & IDENTITY"));
  out.push("id:");
  out.push(safeRunStr(["id"]));
  out.push("");
  out.push("groups:");
  out.push(safeRunStr(["groups"]));
  out.push("");
  out.push("env USER/LOGNAME:");
  out.push(`USER=${process.env.USER || ""}`);
  out.push(`LOGNAME=${process.env.LOGNAME || ""}`);
  out.push("");

  out.push(header("SUID / SGID FILES (top results)"));
  out.push("SUID/SGID (find up to 200 lines):");
  out.push(headLines(safeRunStr(["sh", "-c", "find / -xdev -type f \\( -perm -4000 -o -perm -2000 \\) -ls 2>/dev/null | head -n 200"]), 200));
  out.push("");

  out.push(header("WORLD-WRITABLE EXECUTABLES"));
  out.push(headLines(safeRunStr(["sh", "-c", "find / -xdev -type f -perm -o+w -ls 2>/dev/null | head -n 200"]), 200));
  out.push("");

  out.push(header("READABLE /etc files"));
  ["/etc/passwd","/etc/group"].forEach(f => {
    if (exists(f)) {
      out.push(`File: ${f}`);
      out.push(safeRunStr(["ls", "-l", f]));
    }
  });
  out.push("");

  out.push(header("ENVIRONMENT & PATH"));
  out.push(`PATH=${process.env.PATH || ""}`);
  out.push(`SHELL=${process.env.SHELL || ""}`);
  out.push("");
  out.push("Exported environment variables (first 200 lines):");
  out.push(headLines(Object.entries(process.env).map(([k,v]) => `${k}=${v}`).join("\n"), 200));
  out.push("");

  out.push(header("CRON & SCHEDULED TASKS"));
  out.push("/etc/cron* listing:");
  out.push(headLines(safeRunStr(["sh","-c","ls -la /etc/cron* 2>/dev/null || true"]), 200));
  out.push("");
  out.push("crontab -l (current user):");
  out.push(headLines(safeRunStr(["crontab","-l"], { timeout: 5000 }), 200) || "(no crontab or permission denied)");
  out.push("");
  if (exists("/var/spool/cron")) {
    out.push("/var/spool/cron contents:");
    out.push(safeRunStr(["sh","-c","ls -la /var/spool/cron 2>/dev/null || true"]));
  }
  out.push("");

  out.push(header("SYSTEM SERVICES (systemd/launchctl/rc)"));
  if (safeRunStr(["which","systemctl"])) {
    out.push("systemctl --failed (if any):");
    out.push(headLines(safeRunStr(["systemctl","--failed","--no-legend"], { timeout: 8000 }), 200));
    out.push("");
    out.push("systemctl list-unit-files --type=service (top 40):");
    out.push(headLines(safeRunStr(["systemctl","list-unit-files","--type=service","--no-legend"], { timeout: 8000 }), 200));
  } else {
    out.push("systemctl not available.");
  }
  out.push("");

  out.push(header("DOCKER / LXD / CONTAINERS"));
  out.push("docker version (server):");
  out.push(headLines(safeRunStr(["sh","-c","docker version --format '{{.Server.Version}}' 2>/dev/null || true"]), 20));
  out.push("Checking docker socket /var/run/docker.sock:");
  out.push(safeRunStr(["ls","-l","/var/run/docker.sock"]));
  out.push("");

  out.push(header("KERNEL / EXPLOITABLE INFO (informational only)"));
  out.push("uname -r:");
  out.push(safeRunStr(["uname","-r"]));
  out.push("");

  out.push(header("CAPABILITIES (if getcap present)"));
  if (safeRunStr(["which","getcap"])) {
    out.push(headLines(safeRunStr(["sh","-c","getcap -r / 2>/dev/null | head -n 80"]), 80));
  } else {
    out.push("getcap not installed");
  }
  out.push("");

  out.push(header("INSTALLED PACKAGES (common package managers)"));
  if (safeRunStr(["which","dpkg"])) {
    out.push(headLines(safeRunStr(["sh","-c","dpkg -l | head -n 40"]), 40));
  } else if (safeRunStr(["which","rpm"])) {
    out.push(headLines(safeRunStr(["sh","-c","rpm -qa | head -n 40"]), 40));
  } else {
    out.push("No dpkg/rpm found (or not accessible)");
  }
  out.push("");

  out.push(header("SSH KEYS / AGENTS"));
  out.push(`SSH_AGENT_PID=${process.env.SSH_AGENT_PID || ""}`);
  out.push(`SSH_AUTH_SOCK=${process.env.SSH_AUTH_SOCK || ""}`);
  out.push("Listing ~/.ssh (if accessible):");
  out.push(headLines(safeRunStr(["sh","-c","ls -la ~/.ssh 2>/dev/null || true"]), 200));
  out.push("");

  out.push(header("HOME DIRECTORY WRITABLE CHECKS"));
  out.push("Home dir listing:");
  out.push(headLines(safeRunStr(["ls","-lad", process.env.HOME || "~"]), 20));
  out.push("Home dir stat:");
  out.push(statSafe(process.env.HOME || "~"));
  out.push("");

  out.push(header("SENSITIVE FILES SEARCH (names only; limited checks)"));
  const commonPaths = [
    path.join(process.env.HOME || "", ".aws"),
    path.join(process.env.HOME || "", ".aws","credentials"),
    path.join(process.env.HOME || "", ".git-credentials"),
    path.join(process.env.HOME || "", ".netrc"),
    path.join(process.env.HOME || "", ".docker","config.json"),
    "/root/.ssh"
  ];
  commonPaths.forEach(p => {
    out.push(`Check: ${p}`);
    out.push(headLines(safeRunStr(["sh","-c", `ls -la ${p} 2>/dev/null || true`]), 20));
  });
  out.push("");

  out.push(header("NETWORK INFO"));
  if (safeRunStr(["which","ip"])) {
    out.push(headLines(safeRunStr(["ip","addr","show"]), 200));
  } else if (safeRunStr(["which","ifconfig"])) {
    out.push(headLines(safeRunStr(["ifconfig"], { timeout: 5000 }), 200));
  } else {
    out.push("no ip/ifconfig command");
  }
  out.push("");
  out.push("netstat -tunlp:");
  out.push(headLines(safeRunStr(["sh","-c","netstat -tunlp 2>/dev/null || true"]), 40));
  out.push("");

  out.push(header("SUMMARY HINTS (informational only)"));
  out.push([
    "- Writable /etc or passwd files",
    "- SUID/SGID executables owned by root",
    "- World-writable executables or directories in PATH",
    "- Unprotected docker socket (/var/run/docker.sock)",
    "- Dangerous cron jobs (owned by root but editable)",
    "- Unusual capabilities (getcap output)"
  ].join("\n"));
  out.push("");
  out.push("Notes: This script DOES NOT attempt exploitation. It only gathers information for manual review.");
  out.push("");
  out.push("End of report.");

  try {
    fs.writeFileSync(OUTFILE, out.join("\n"), { encoding: "utf8", mode: 0o600 });
    console.log(`✅ Discovery report written to: ${OUTFILE}`);
    console.log(`📁 File size: ${fs.statSync(OUTFILE).size} bytes`);
    return `Report generated: ${OUTFILE}`;
  } catch (e) {
    console.error(`❌ Failed to write ${OUTFILE}:`, e.message);
    throw e;
  }
};