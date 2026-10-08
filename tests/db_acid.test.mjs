import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { initDatabase, withTransaction } from "../lib/db.mjs";

test("db_acid: connection enables WAL mode and foreign keys", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vera-test-db-wal-"));
  try {
    const db = initDatabase(tempDir);
    const journalMode = db.prepare("PRAGMA journal_mode").get();
    assert.strictEqual(journalMode.journal_mode.toLowerCase(), "wal");

    const foreignKeys = db.prepare("PRAGMA foreign_keys").get();
    assert.strictEqual(foreignKeys.foreign_keys, 1);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test("db_acid: withTransaction commits on successful completion", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vera-test-db-tx-pass-"));
  try {
    const db = initDatabase(tempDir);
    db.exec("CREATE TABLE test_counter (id TEXT PRIMARY KEY, val INTEGER);");

    withTransaction((txDb) => {
      txDb.prepare("INSERT INTO test_counter (id, val) VALUES (?, ?)").run("item1", 100);
      txDb.prepare("INSERT INTO test_counter (id, val) VALUES (?, ?)").run("item2", 200);
    }, tempDir);

    const rows = db.prepare("SELECT * FROM test_counter ORDER BY val ASC").all();
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].val, 100);
    assert.strictEqual(rows[1].val, 200);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test("db_acid: withTransaction rolls back completely on thrown exception", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vera-test-db-tx-fail-"));
  try {
    const db = initDatabase(tempDir);
    db.exec("CREATE TABLE test_rollback (id TEXT PRIMARY KEY, val INTEGER);");
    db.prepare("INSERT INTO test_rollback (id, val) VALUES (?, ?)").run("base", 50);

    assert.throws(() => {
      withTransaction((txDb) => {
        txDb.prepare("INSERT INTO test_rollback (id, val) VALUES (?, ?)").run("dirty1", 999);
        throw new Error("Simulated Transaction Failure");
      }, tempDir);
    }, /Simulated Transaction Failure/);

    const rows = db.prepare("SELECT * FROM test_rollback").all();
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, "base");
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
