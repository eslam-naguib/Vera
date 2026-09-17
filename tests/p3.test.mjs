import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { runDeterministicQualityGate } from "../lib/commands/review.mjs";

test("quality_gate: handles missing package.json fail-closed", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-gate-empty-"));
  const res = runDeterministicQualityGate(tempDir);
  assert.strictEqual(res.hasTests, false);
  assert.strictEqual(res.passed, false);
  assert.strictEqual(res.exitCode, 1);
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test("quality_gate: detects passing deterministic test suite", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-gate-pass-"));
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "test-pkg", scripts: { test: "npm test" } })
  );

  const res = runDeterministicQualityGate(tempDir, () => ({
    hasTests: true,
    passed: true,
    exitCode: 0,
    output: "All 15 tests passed."
  }));

  assert.strictEqual(res.hasTests, true);
  assert.strictEqual(res.passed, true);
  assert.strictEqual(res.exitCode, 0);

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test("quality_gate: detects failing deterministic test suite", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-gate-fail-"));
  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ name: "test-pkg", scripts: { test: "npm test" } })
  );

  const res = runDeterministicQualityGate(tempDir, () => ({
    hasTests: true,
    passed: false,
    exitCode: 1,
    output: "AssertionError: 2 != 3"
  }));

  assert.strictEqual(res.hasTests, true);
  assert.strictEqual(res.passed, false);
  assert.strictEqual(res.exitCode, 1);

  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
});

test("pipeline: extractGitContext safely extracts git delta in milliseconds", async () => {
  const { extractGitContext } = await import("../lib/commands/review.mjs");
  const ctx = extractGitContext(process.cwd());
  assert.ok(typeof ctx.gitAvailable === "boolean");
  assert.ok(typeof ctx.durationMs === "number");
  assert.ok(ctx.durationMs < 5000, "Git extraction should take under 5 seconds");
});

test("pipeline: scanProjectTopology accurately identifies packages and configs", async () => {
  const { scanProjectTopology } = await import("../lib/commands/audit.mjs");
  const topology = scanProjectTopology(process.cwd());
  assert.ok(Array.isArray(topology.packages));
  assert.ok(Array.isArray(topology.configs));
  assert.ok(typeof topology.durationMs === "number");
  assert.ok(topology.durationMs < 1000, "Topology scan should take under 1 second");
});

