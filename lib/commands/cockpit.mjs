import { startCockpitServer } from "../../cockpit/server.mjs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function handleCockpit(args, config) {
  const sub = args[0] || "start";
  const port = parseInt(config.cockpit_port || "5050", 10);

  // Check if cockpit is already responding
  let isRunning = false;
  try {
    const res = await fetch(`http://localhost:${port}/api/status`, {
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) isRunning = true;
  } catch {}

  if (sub === "status") {
    if (isRunning) {
      console.log(`\n🟢 Signor Cockpit is RUNNING on http://localhost:${port}\n`);
    } else {
      console.log(`\n🔴 Signor Cockpit is NOT running on port ${port}.\nRun 'signor cockpit' to start it.\n`);
    }
    return;
  }

  if (sub === "stop") {
    console.log(`\nStopping Signor Cockpit on port ${port}...`);
    // 1. Try graceful HTTP shutdown
    try {
      const shutdownRes = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
        method: "POST",
        signal: AbortSignal.timeout(2000),
      });
      if (shutdownRes.ok) {
        console.log(`✅ Cockpit stopped gracefully via HTTP shutdown.\n`);
        return;
      }
    } catch {}

    // 2. Try PID file
    const fs = await import("node:fs");
    const pidFile = path.join(process.cwd(), ".signor", "cockpit.pid");
    if (fs.existsSync(pidFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(pidFile, "utf-8"));
        const pid = data.pid;
        if (pid) {
          process.kill(pid, "SIGTERM");
          console.log(`✅ Cockpit process (PID ${pid}) terminated via SIGTERM.\n`);
          try { fs.unlinkSync(pidFile); } catch {}
          return;
        }
      } catch (err) {
        // Fallthrough if process already stopped
      }
    }

    console.log(`No active Cockpit process found for project.\n`);
    return;
  }

  if (isRunning) {
    console.log(`\n🟢 Signor Cockpit is ALREADY running at: http://localhost:${port}`);
    console.log(`   You can open it in your browser right now!\n`);
    return;
  }

  // If in daemon mode or default
  if (args.includes("--daemon") || args.includes("-d")) {
    const serverScript = path.resolve(__dirname, "../../cockpit/server.mjs");
    const child = spawn(process.execPath, [serverScript], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, SIGNOR_PORT: String(port) },
    });
    child.unref();
    console.log(`\n🚀 Signor Developer Cockpit launched in background!`);
    console.log(`   URL: http://localhost:${port}`);
    console.log(`   PID: ${child.pid}\n`);
    return;
  }

  // Foreground mode
  startCockpitServer(port);
}
