import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadConfig, saveGlobalConfig, saveLocalConfig, EFFORT_MAP, maskConfig } from "../lib/config.mjs";
import { KNOWN_MODELS, pingModel, checkAllModels, fetchRemoteModels } from "../lib/models.mjs";
import { callSignor } from "../lib/engine.mjs";
import { getRecentRuns, getRecentHealthChecks } from "../lib/db.mjs";
import { atomicWriteFileSync } from "../lib/atomic.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function startCockpitServer(port = 5050, options = {}) {
  const sessionToken = crypto.randomBytes(24).toString("hex");
  const projectDir = process.cwd();
  const signorDir = path.join(projectDir, ".signor");
  if (!fs.existsSync(signorDir)) fs.mkdirSync(signorDir, { recursive: true });

  const pidFile = path.join(signorDir, "cockpit.pid");
  const tokenFile = path.join(signorDir, ".cockpit-token");

  // Write PID and token for management
  atomicWriteFileSync(pidFile, JSON.stringify({ pid: process.pid, port, startedAt: new Date().toISOString() }));
  atomicWriteFileSync(tokenFile, sessionToken, { mode: 0o600 });

  const cleanup = () => {
    try { if (fs.existsSync(pidFile)) fs.unlinkSync(pidFile); } catch {}
    try { if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile); } catch {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  const server = http.createServer(async (req, res) => {
    // Security Headers on all responses
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:;");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");

    // Host Header Validation
    const host = (req.headers.host || "").toLowerCase();
    const isAllowedHost = host.startsWith("127.0.0.1:") || host.startsWith("localhost:") || host === "127.0.0.1" || host === "localhost";
    if (host && !isAllowedHost) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Bad Request: Invalid Host header." }));
      return;
    }

    // Origin Check & CORS: Allow only localhost / 127.0.0.1 loopback
    const origin = req.headers.origin || "";
    const isAllowedOrigin = !origin || origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:");
    if (isAllowedOrigin && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Signor-Token");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (origin && !isAllowedOrigin) {
      res.writeHead(403, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Forbidden: Cross-origin request rejected." }));
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = url.pathname;

    // Static Assets
    if (pathname === "/" || pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(fs.readFileSync(path.join(__dirname, "index.html"), "utf-8"));
      return;
    }

    if (pathname === "/styles.css") {
      res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
      res.end(fs.readFileSync(path.join(__dirname, "styles.css"), "utf-8"));
      return;
    }

    if (pathname === "/app.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
      res.end(fs.readFileSync(path.join(__dirname, "app.js"), "utf-8"));
      return;
    }

    // Helper: JSON response
    const jsonRes = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    };

    // Helper: Parse JSON Body with 1MB size limit and 413 handling
    const parseBody = () => new Promise((resolve, reject) => {
      let body = "";
      const maxBytes = 1024 * 1024; // 1MB
      let bytesReceived = 0;

      req.on("data", chunk => {
        bytesReceived += chunk.length;
        if (bytesReceived > maxBytes) {
          const err = new Error("Payload Too Large");
          err.statusCode = 413;
          req.destroy(err);
          reject(err);
          return;
        }
        body += chunk;
      });

      req.on("end", () => {
        try {
          resolve(JSON.parse(body || "{}"));
        } catch {
          const err = new Error("Malformed JSON payload");
          err.statusCode = 400;
          reject(err);
        }
      });

      req.on("error", err => reject(err));
    });

    try {
      // API: GET /api/config
      if (pathname === "/api/config" && req.method === "GET") {
        const config = loadConfig({}, process.cwd());
        const safeConfig = maskConfig(config);
        jsonRes({
          config: safeConfig,
          effortLevels: EFFORT_MAP,
          projectDir: process.cwd(),
          sessionToken,
        });
        return;
      }

      // API: POST /api/config
      if (pathname === "/api/config" && req.method === "POST") {
        const body = await parseBody();
        const targetScope = body.targetScope || "local";
        const updates = {};
        if (body.model) updates.model = body.model;
        if (body.effort) updates.effort = body.effort;
        if (body.base_url) updates.base_url = body.base_url;
        if (body.api_key) updates.api_key = body.api_key;
        if (body.cockpit_port) updates.cockpit_port = parseInt(body.cockpit_port, 10);
        if (body.enabled_models) updates.enabled_models = body.enabled_models;

        let result;
        if (targetScope === "global") {
          result = saveGlobalConfig(updates);
        } else {
          result = saveLocalConfig(updates, process.cwd());
        }

        if (result.success) {
          jsonRes({ success: true, config: maskConfig(result.config), path: result.path });
        } else {
          jsonRes({ success: false, error: result.error }, 400);
        }
        return;
      }

      // API: GET /api/models
      if (pathname === "/api/models" && req.method === "GET") {
        const config = loadConfig({}, process.cwd());
        const remoteModels = await fetchRemoteModels(config);
        const enabledList = config.enabled_models || null;

        const allMapped = remoteModels.map(m => {
          const isHidden = enabledList ? !enabledList.includes(m.id) : false;
          return { ...m, hidden: isHidden };
        });

        const visibleModels = allMapped.filter(m => !m.hidden);
        const hiddenCount = allMapped.filter(m => m.hidden).length;

        jsonRes({
          models: visibleModels,
          allModels: allMapped,
          hiddenCount,
          activeModel: config.model,
        });
        return;
      }

      // API: POST /api/models/ping-one
      if (pathname === "/api/models/ping-one" && req.method === "POST") {
        const body = await parseBody();
        const modelId = body.modelId;
        if (!modelId) {
          jsonRes({ error: "modelId is required" }, 400);
          return;
        }
        const config = loadConfig({}, process.cwd());
        const health = await pingModel(modelId, config);
        jsonRes(health);
        return;
      }

      // API: POST /api/models/ping-all
      if (pathname === "/api/models/ping-all" && req.method === "POST") {
        const config = loadConfig({}, process.cwd());
        const remoteModels = await fetchRemoteModels(config);
        const results = await checkAllModels(config, remoteModels, 3);
        const healthMap = {};
        results.forEach(r => { healthMap[r.model] = r; });
        jsonRes({ results, healthMap });
        return;
      }

      // API: POST /api/ping
      if (pathname === "/api/ping" && req.method === "POST") {
        const config = loadConfig({}, process.cwd());
        const start = Date.now();
        const reply = await callSignor([
          { role: "user", content: "Ping! Please confirm active model status concisely in one sentence." }
        ], { max_tokens: 60, temperature: 0.1, silent: true, noStdout: true }, config);
        const latencyMs = Date.now() - start;
        jsonRes({
          success: true,
          model: config.model,
          latencyMs,
          reply,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // API: GET /api/status
      if (pathname === "/api/status" && req.method === "GET") {
        const config = loadConfig({}, process.cwd());
        jsonRes({
          online: true,
          uptime: process.uptime(),
          nodeVersion: process.version,
          activeModel: config.model,
          activeEffort: config.effort,
          activeBaseUrl: config.base_url,
          projectDir: process.cwd(),
        });
        return;
      }

      // API: GET /api/runs
      if (pathname === "/api/runs" && req.method === "GET") {
        const limit = parseInt(url.searchParams.get("limit") || "15", 10);
        const runs = getRecentRuns(limit, process.cwd());
        jsonRes({ runs });
        return;
      }

      // API: GET /api/health-history
      if (pathname === "/api/health-history" && req.method === "GET") {
        const history = getRecentHealthChecks(20, process.cwd());
        jsonRes({ history });
        return;
      }

      // API: POST /api/shutdown (Graceful stopping)
      if (pathname === "/api/shutdown" && req.method === "POST") {
        jsonRes({ success: true, message: "Cockpit shutting down gracefully." });
        setTimeout(() => {
          cleanup();
          server.close();
          process.exit(0);
        }, 200);
        return;
      }

      // 404
      jsonRes({ error: "Endpoint not found" }, 404);
    } catch (err) {
      const status = err.statusCode || 500;
      jsonRes({ error: err.message }, status);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`\n🚀 [Signor Cockpit] Server live on http://127.0.0.1:${port}`);
    console.log(`   Managing Project: ${projectDir}`);
    console.log(`   Press Ctrl+C to stop.\n`);
  });

  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = parseInt(process.env.SIGNOR_PORT || "5050", 10);
  startCockpitServer(port);
}
