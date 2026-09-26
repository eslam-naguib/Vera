import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const dbInstances = new Map();

export function getDatabasePath(projectDir = process.cwd()) {
  const signorDir = path.join(path.resolve(projectDir), ".signor");
  if (!fs.existsSync(signorDir)) {
    fs.mkdirSync(signorDir, { recursive: true });
  }
  return path.join(signorDir, "signor.sqlite");
}

export function initDatabase(projectDir = process.cwd()) {
  const normPath = path.resolve(projectDir);
  if (dbInstances.has(normPath)) return dbInstances.get(normPath);

  const dbPath = getDatabasePath(normPath);
  const db = new DatabaseSync(dbPath);

  // High performance and transactional safety (WAL mode + Foreign Keys + Busy Timeout)
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");

  // Schema versioning / migrations
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  // Create tables for runs, tool calls, artifacts, health checks, models, quality gates, and audit events
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      model_id TEXT NOT NULL,
      effort TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      tool_name TEXT NOT NULL,
      arguments_json TEXT,
      output_preview TEXT,
      status TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      type TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      sha256 TEXT,
      size_bytes INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS health_checks (
      id TEXT PRIMARY KEY,
      model_id TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      http_status INTEGER,
      checked_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discovered_models (
      id TEXT PRIMARY KEY,
      name TEXT,
      provider TEXT,
      tier TEXT,
      raw_json TEXT,
      discovered_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quality_gates (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      has_tests INTEGER NOT NULL,
      passed INTEGER NOT NULL,
      exit_code INTEGER,
      output_snippet TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      details_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_health_model ON health_checks(model_id, checked_at DESC);
    CREATE INDEX IF NOT EXISTS idx_runs_created ON runs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id);
    CREATE INDEX IF NOT EXISTS idx_artifacts_run ON artifacts(run_id);
  `);

  // Record migration v1
  try {
    db.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (1, ?)").run(new Date().toISOString());
  } catch {}

  // Migration v2: Debates and Debate Rounds
  db.exec(`
    CREATE TABLE IF NOT EXISTS debates (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      mode TEXT NOT NULL,
      rounds_count INTEGER NOT NULL DEFAULT 3,
      agent1_model TEXT NOT NULL,
      agent1_effort TEXT NOT NULL,
      agent1_hat TEXT,
      agent2_model TEXT NOT NULL,
      agent2_effort TEXT NOT NULL,
      agent2_hat TEXT,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER,
      final_artifact_path TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS debate_rounds (
      id TEXT PRIMARY KEY,
      debate_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      phase TEXT NOT NULL,
      agent_role TEXT NOT NULL,
      model_id TEXT NOT NULL,
      effort TEXT NOT NULL,
      content TEXT NOT NULL,
      duration_ms INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (debate_id) REFERENCES debates(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_debates_created ON debates(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_debate_rounds ON debate_rounds(debate_id, round_number ASC);
  `);

  try {
    db.prepare("INSERT OR IGNORE INTO migrations (version, applied_at) VALUES (2, ?)").run(new Date().toISOString());
  } catch {}

  dbInstances.set(normPath, db);
  return db;
}

/**
 * Executes a callback within a strict ACID transaction (BEGIN IMMEDIATE ... COMMIT/ROLLBACK).
 */
export function withTransaction(callback, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  db.exec("BEGIN IMMEDIATE;");
  try {
    const result = callback(db);
    db.exec("COMMIT;");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK;");
    } catch {}
    throw err;
  }
}

export function recordRunStart(kind, model_id, effort, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const id = crypto.randomUUID();
  const started_at = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO runs (id, kind, status, model_id, effort, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, kind, "running", model_id, effort, started_at);
  return id;
}

export function recordRunFinish(id, status, duration_ms, error_code = null, error_message = null, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const finished_at = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE runs
    SET status = ?, duration_ms = ?, error_code = ?, error_message = ?, finished_at = ?
    WHERE id = ?
  `);
  stmt.run(status, duration_ms, error_code, error_message, finished_at, id);
}

export function recordToolCall(runId, tool_name, args, result, status = "success", projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const id = crypto.randomUUID();
  const argsJson = typeof args === "object" ? JSON.stringify(args) : String(args);
  const preview = String(result || "").slice(0, 1000);

  const stmt = db.prepare(`
    INSERT INTO tool_calls (id, run_id, tool_name, arguments_json, output_preview, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, runId, tool_name, argsJson, preview, status);
  return id;
}

export function recordArtifact(runId, type, relative_path, absolutePath, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const id = crypto.randomUUID();
  let sha256 = null;
  let sizeBytes = 0;

  try {
    if (fs.existsSync(absolutePath)) {
      const content = fs.readFileSync(absolutePath);
      sizeBytes = content.length;
      sha256 = crypto.createHash("sha256").update(content).digest("hex");
    }
  } catch {}

  const stmt = db.prepare(`
    INSERT INTO artifacts (id, run_id, type, relative_path, sha256, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, runId, type, relative_path, sha256, sizeBytes);
  return id;
}

export function recordQualityGate(runId, gateResult, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const id = crypto.randomUUID();
  const stmt = db.prepare(`
    INSERT INTO quality_gates (id, run_id, has_tests, passed, exit_code, output_snippet)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    runId,
    gateResult.hasTests ? 1 : 0,
    gateResult.passed ? 1 : 0,
    gateResult.exitCode ?? 0,
    (gateResult.output || "").slice(0, 2000)
  );
  return id;
}

export function recordHealthCheck(model_id, status, latency_ms, http_status = null, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const id = crypto.randomUUID();
  const checked_at = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO health_checks (id, model_id, status, latency_ms, http_status, checked_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, model_id, status, latency_ms, http_status, checked_at);
  return id;
}

export function getRecentRuns(limit = 10, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const stmt = db.prepare(`
    SELECT * FROM runs
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function getRecentHealthChecks(limit = 20, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const stmt = db.prepare(`
    SELECT * FROM health_checks
    ORDER BY checked_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function recordDebateStart(info, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const id = crypto.randomUUID();
  const started_at = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO debates (
      id, task, mode, rounds_count,
      agent1_model, agent1_effort, agent1_hat,
      agent2_model, agent2_effort, agent2_hat,
      status, started_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    info.task,
    info.mode || "homogeneous",
    info.rounds_count || 3,
    info.agent1_model,
    info.agent1_effort,
    info.agent1_hat || "blue",
    info.agent2_model,
    info.agent2_effort,
    info.agent2_hat || "red",
    "running",
    started_at
  );
  return id;
}

export function recordDebateRound(roundInfo, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const id = crypto.randomUUID();

  const stmt = db.prepare(`
    INSERT INTO debate_rounds (
      id, debate_id, round_number, phase,
      agent_role, model_id, effort, content, duration_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    roundInfo.debate_id,
    roundInfo.round_number,
    roundInfo.phase,
    roundInfo.agent_role,
    roundInfo.model_id,
    roundInfo.effort,
    roundInfo.content,
    roundInfo.duration_ms || 0
  );
  return id;
}

export function recordDebateFinish(debateId, status, durationMs, finalArtifactPath = null, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const finished_at = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE debates
    SET status = ?, duration_ms = ?, finished_at = ?, final_artifact_path = ?
    WHERE id = ?
  `);
  stmt.run(status, durationMs, finished_at, finalArtifactPath, debateId);
}

export function getRecentDebates(limit = 10, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const stmt = db.prepare(`
    SELECT * FROM debates
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

export function getDebateRounds(debateId, projectDir = process.cwd()) {
  const db = initDatabase(projectDir);
  const stmt = db.prepare(`
    SELECT * FROM debate_rounds
    WHERE debate_id = ?
    ORDER BY round_number ASC
  `);
  return stmt.all(debateId);
}

