import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  getPendingChangeSet,
  getPendingChangeCount,
  clearPendingChangeSet,
  stageFileChange,
  generateUnifiedDiff,
  formatColorizedDiff,
  verifyChangeSetIntegrity,
  applyPendingChangeSet
} from "../lib/safety/changeset.mjs";

test("changeset: in-memory staging does not touch disk until approved", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-cs-test-"));
  clearPendingChangeSet();

  try {
    const testFile = "src/hello.js";
    const fullTestPath = path.join(tmpDir, testFile);

    // Stage new file creation
    const staged = stageFileChange({
      projectDir: tmpDir,
      filePath: testFile,
      operation: "create",
      newContent: "console.log('Hello World');\n",
      oldContent: ""
    });

    assert.strictEqual(getPendingChangeCount(), 1);
    assert.strictEqual(staged.operation, "create");
    assert.strictEqual(staged.stats.additions, 1);
    assert.strictEqual(staged.stats.deletions, 0);

    // Critical assertion: File must NOT exist on disk yet
    assert.strictEqual(fs.existsSync(fullTestPath), false, "File must not exist on disk while staged");

    // Unified diff preview check
    assert.ok(staged.diffPreview.includes("--- a/src/hello.js"));
    assert.ok(staged.diffPreview.includes("+++ b/src/hello.js"));
    assert.ok(staged.diffPreview.includes("+ console.log('Hello World');"));

    // Colorized formatting helper
    const colored = formatColorizedDiff(staged.diffPreview);
    assert.ok(colored.includes("\x1b[32m+ console.log('Hello World');\x1b[0m"));

    // Apply change with autoApprove: true
    const result = await applyPendingChangeSet({ autoApprove: true, projectDir: tmpDir });
    assert.strictEqual(result.status, "success");
    assert.strictEqual(result.applied, 1);

    // Now file MUST exist on disk with exact content
    assert.strictEqual(fs.existsSync(fullTestPath), true);
    assert.strictEqual(fs.readFileSync(fullTestPath, "utf-8"), "console.log('Hello World');\n");

    // Queue is cleared
    assert.strictEqual(getPendingChangeCount(), 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearPendingChangeSet();
  }
});

test("changeset: detects external modifications and aborts on hash mismatch (Anti-Race Condition)", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-race-test-"));
  clearPendingChangeSet();

  try {
    const testFile = "app.config.js";
    const fullTestPath = path.join(tmpDir, testFile);
    fs.writeFileSync(fullTestPath, "const PORT = 3000;\n", "utf-8");

    // Agent stages an edit based on PORT = 3000
    stageFileChange({
      projectDir: tmpDir,
      filePath: testFile,
      operation: "edit",
      oldContent: "const PORT = 3000;\n",
      newContent: "const PORT = 8080;\n"
    });

    // Simulate an external developer modifying the file on disk before agent applies
    fs.writeFileSync(fullTestPath, "const PORT = 4000; // External change\n", "utf-8");

    // Integrity check must catch this dirty disk state
    const integrity = verifyChangeSetIntegrity(getPendingChangeSet(), tmpDir);
    assert.strictEqual(integrity.ok, false);
    assert.strictEqual(integrity.conflicts.length, 1);
    assert.ok(integrity.conflicts[0].reason.includes("Dirty disk state: hash mismatch"));

    // Applying must fail safely without overwriting the external change
    const applyRes = await applyPendingChangeSet({ autoApprove: true, projectDir: tmpDir });
    assert.strictEqual(applyRes.status, "conflict");
    assert.strictEqual(applyRes.applied, 0);

    // Verify disk content was preserved
    assert.strictEqual(fs.readFileSync(fullTestPath, "utf-8"), "const PORT = 4000; // External change\n");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearPendingChangeSet();
  }
});

test("changeset: chaining multiple edits on the same file preserves base content", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-chain-test-"));
  clearPendingChangeSet();

  try {
    const orig = "line 1\nline 2\nline 3\n";
    stageFileChange({
      projectDir: tmpDir,
      filePath: "chain.txt",
      operation: "edit",
      oldContent: orig,
      newContent: "line 1 (edited)\nline 2\nline 3\n"
    });

    // Stage second edit
    stageFileChange({
      projectDir: tmpDir,
      filePath: "chain.txt",
      operation: "edit",
      oldContent: "line 1 (edited)\nline 2\nline 3\n",
      newContent: "line 1 (edited)\nline 2\nline 3 (edited)\n"
    });

    assert.strictEqual(getPendingChangeCount(), 1);
    const pending = getPendingChangeSet()[0];
    assert.strictEqual(pending.oldContent, orig);
    assert.strictEqual(pending.newContent, "line 1 (edited)\nline 2\nline 3 (edited)\n");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearPendingChangeSet();
  }
});
