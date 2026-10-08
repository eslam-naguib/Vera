import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeTool } from "../lib/tools.mjs";
import { getPendingChangeCount, clearPendingChangeSet, applyPendingChangeSet } from "../lib/safety/changeset.mjs";

test("tools: view_file reads with line slicing and capping", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-tools-test-"));

  try {
    const lines = [];
    for (let i = 1; i <= 500; i++) {
      lines.push(`console.log("Line number ${i}");`);
    }
    const filePath = path.join(tmpDir, "large.js");
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");

    // Test line slicing (start_line: 10, end_line: 20)
    const resSliceRaw = await executeTool("view_file", { path: "large.js", start_line: 10, end_line: 20 }, tmpDir);
    const resSlice = JSON.parse(resSliceRaw);

    assert.strictEqual(resSlice.total_lines, 500);
    assert.strictEqual(resSlice.start_line, 10);
    assert.strictEqual(resSlice.end_line, 20);
    assert.ok(resSlice.content.includes("10: console.log(\"Line number 10\");"));
    assert.ok(resSlice.content.includes("20: console.log(\"Line number 20\");"));
    assert.ok(!resSlice.content.includes("21: "));

    // Test non-existent file
    const resMissingRaw = await executeTool("view_file", { path: "nonexistent.js" }, tmpDir);
    const resMissing = JSON.parse(resMissingRaw);
    assert.ok(resMissing.error.includes("File not found"));

    // Test binary file detection
    const binPath = path.join(tmpDir, "image.png");
    fs.writeFileSync(binPath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]));
    const resBinRaw = await executeTool("view_file", { path: "image.png" }, tmpDir);
    const resBin = JSON.parse(resBinRaw);
    assert.ok(resBin.error.includes("Binary file cannot be displayed"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("tools: search_code finds matches with capped snippets and ignores caches", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-search-test-"));

  try {
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });

    fs.writeFileSync(path.join(tmpDir, "src", "index.js"), "const secretKey = 'FIND_ME_TARGET';\n");
    fs.writeFileSync(path.join(tmpDir, "node_modules", "pkg", "index.js"), "const secretKey = 'FIND_ME_TARGET';\n");

    const searchResRaw = await executeTool("search_code", { query: "FIND_ME_TARGET" }, tmpDir);
    const searchRes = JSON.parse(searchResRaw);

    assert.strictEqual(searchRes.total_matches, 1);
    assert.strictEqual(searchRes.matches[0].file, "src/index.js");
    assert.ok(searchRes.matches[0].snippet.includes("FIND_ME_TARGET"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("tools: list_directory returns entries ignoring heavy folders", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-list-test-"));

  try {
    fs.mkdirSync(path.join(tmpDir, "lib"));
    fs.mkdirSync(path.join(tmpDir, "node_modules"));
    fs.writeFileSync(path.join(tmpDir, "index.js"), "// root");

    const listResRaw = await executeTool("list_directory", { path: "." }, tmpDir);
    const listRes = JSON.parse(listResRaw);

    const names = listRes.entries.map(e => e.name);
    assert.ok(names.includes("lib"));
    assert.ok(names.includes("index.js"));
    assert.ok(!names.includes("node_modules"), "Must filter out node_modules");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("tools: write_file and edit_file stage changes safely in memory", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-mod-test-"));
  clearPendingChangeSet();

  try {
    const targetFile = "src/calculator.js";
    const initialCode = "export function add(a, b) {\n  return a + b;\n}\n";

    // 1. Stage creation of new file
    const writeResRaw = await executeTool("write_file", { path: targetFile, content: initialCode }, tmpDir);
    const writeRes = JSON.parse(writeResRaw);

    assert.strictEqual(writeRes.status, "staged_for_approval");
    assert.strictEqual(getPendingChangeCount(), 1);

    // Verify NOT on disk yet
    assert.strictEqual(fs.existsSync(path.join(tmpDir, targetFile)), false);

    // Apply the write
    await applyPendingChangeSet({ autoApprove: true, projectDir: tmpDir });
    assert.strictEqual(fs.existsSync(path.join(tmpDir, targetFile)), true);

    // 2. Stage surgical edit using edit_file
    const editResRaw = await executeTool("edit_file", {
      path: targetFile,
      target_content: "return a + b;",
      replacement_content: "return Number(a) + Number(b);"
    }, tmpDir);
    const editRes = JSON.parse(editResRaw);

    assert.strictEqual(editRes.status, "staged_for_approval");
    assert.strictEqual(getPendingChangeCount(), 1);

    // Verify disk still has old code
    assert.ok(fs.readFileSync(path.join(tmpDir, targetFile), "utf-8").includes("return a + b;"));

    // Apply edit
    await applyPendingChangeSet({ autoApprove: true, projectDir: tmpDir });
    const updatedCode = fs.readFileSync(path.join(tmpDir, targetFile), "utf-8");
    assert.ok(updatedCode.includes("return Number(a) + Number(b);"));

    // 3. Test uniqueness validation (reject duplicate matches)
    fs.writeFileSync(path.join(tmpDir, "dups.txt"), "foo\nfoo\nbar\n");
    const dupResRaw = await executeTool("edit_file", {
      path: "dups.txt",
      target_content: "foo",
      replacement_content: "baz"
    }, tmpDir);
    const dupRes = JSON.parse(dupResRaw);
    assert.ok(dupRes.error.includes("matches 2 locations"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    clearPendingChangeSet();
  }
});
