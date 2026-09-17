import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  initDatabase,
  withTransaction,
  recordRunStart,
  recordRunFinish,
  recordToolCall,
  recordQualityGate,
  recordHealthCheck,
  getRecentRuns,
  getRecentHealthChecks
} from "../lib/db.mjs";
import { atomicWriteFileSync, safeReadFileSync } from "../lib/atomic.mjs";

test("db: initializes SQLite database and runs ledger", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-db-test-"));
  const db = initDatabase(tempDir);
  assert.ok(db, "Database instance must be returned");

  // Record a run
  const runId = recordRunStart("plan", "gpt-5.6-sol", "high", tempDir);
  assert.ok(runId, "runId must be generated");

  // Record a tool call
  const toolCallId = recordToolCall(runId, "view_file", { path: "package.json" }, "file content", "success", tempDir);
  assert.ok(toolCallId, "toolCallId must be generated");

  // Record quality gate
  recordQualityGate(runId, { hasTests: true, passed: true, exitCode: 0, output: "14 passed" }, tempDir);

  // Record run finish
  recordRunFinish(runId, "completed", 1250, null, null, tempDir);

  // Retrieve runs
  const runs = getRecentRuns(5, tempDir);
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].id, runId);
  assert.strictEqual(runs[0].status, "completed");
  assert.strictEqual(runs[0].duration_ms, 1250);
  assert.strictEqual(runs[0].model_id, "gpt-5.6-sol");

  // Record health check
  recordHealthCheck("gpt-5.6-sol", "live", 120, 200, tempDir);
  const healthList = getRecentHealthChecks(5, tempDir);
  assert.ok(healthList.length >= 1);
  const solHealth = healthList.find(h => h.model_id === "gpt-5.6-sol");
  assert.strictEqual(solHealth.status, "live");
  assert.strictEqual(solHealth.latency_ms, 120);

  // Clean up
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test("db: withTransaction commits on success and rolls back on exception", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-tx-test-"));
  
  // Successful transaction
  withTransaction((db) => {
    db.prepare("INSERT INTO audit_events (id, event_type, details_json) VALUES (?, ?, ?)").run("tx-1", "LOGIN", "{}");
  }, tempDir);

  const db = initDatabase(tempDir);
  const row1 = db.prepare("SELECT * FROM audit_events WHERE id = ?").get("tx-1");
  assert.ok(row1, "Committed transaction must persist");

  // Failed transaction rolls back
  assert.throws(() => {
    withTransaction((db) => {
      db.prepare("INSERT INTO audit_events (id, event_type, details_json) VALUES (?, ?, ?)").run("tx-2", "FAIL_OP", "{}");
      throw new Error("Simulated failure inside transaction");
    }, tempDir);
  });

  const row2 = db.prepare("SELECT * FROM audit_events WHERE id = ?").get("tx-2");
  assert.strictEqual(row2, undefined, "Rolled-back transaction must NOT persist");

  // Clean up
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test("atomic: writes files atomically and safely reads them", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-atomic-test-"));
  const target = path.join(tempDir, "data.txt");

  atomicWriteFileSync(target, "Hello Atomic Signor");
  const read = safeReadFileSync(target);
  assert.strictEqual(read, "Hello Atomic Signor");

  const missing = safeReadFileSync(path.join(tempDir, "missing.txt"), "DEFAULT");
  assert.strictEqual(missing, "DEFAULT");

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});
