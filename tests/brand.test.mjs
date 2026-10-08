import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { BRAND, resolveConfigDir, resolveDbPath, resolveBrandApiKey } from "../lib/brand.mjs";

test("brand: basic brand metadata", () => {
  assert.strictEqual(BRAND.id, "vera");
  assert.strictEqual(BRAND.bin, "vera");
  assert.strictEqual(BRAND.name, "Vera AI");
  assert.ok(BRAND.legacyDirs.includes(".signor"));
});

test("brand: resolveConfigDir falls back to legacy .signor directory if present", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vera-brand-test-"));
  try {
    // 1. Initially neither exists
    const resolvedDefault = resolveConfigDir(tmpDir);
    assert.strictEqual(resolvedDefault, path.join(tmpDir, ".vera"));

    // 2. Create .signor
    const legacyDir = path.join(tmpDir, ".signor");
    fs.mkdirSync(legacyDir);
    const resolvedLegacy = resolveConfigDir(tmpDir);
    assert.strictEqual(resolvedLegacy, legacyDir);

    // 3. Create .vera -> takes precedence
    const veraDir = path.join(tmpDir, ".vera");
    fs.mkdirSync(veraDir);
    const resolvedPrimary = resolveConfigDir(tmpDir);
    assert.strictEqual(resolvedPrimary, veraDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("brand: resolveBrandApiKey checks VERA_API_KEY first then SIGNOR_API_KEY", () => {
  const origVera = process.env.VERA_API_KEY;
  const origSignor = process.env.SIGNOR_API_KEY;

  try {
    delete process.env.VERA_API_KEY;
    process.env.SIGNOR_API_KEY = "sk-signor-legacy-key";
    assert.strictEqual(resolveBrandApiKey(), "sk-signor-legacy-key");

    process.env.VERA_API_KEY = "sk-vera-primary-key";
    assert.strictEqual(resolveBrandApiKey(), "sk-vera-primary-key");
  } finally {
    if (origVera !== undefined) process.env.VERA_API_KEY = origVera;
    else delete process.env.VERA_API_KEY;

    if (origSignor !== undefined) process.env.SIGNOR_API_KEY = origSignor;
    else delete process.env.SIGNOR_API_KEY;
  }
});
