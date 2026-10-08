import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateProjectBlueprint } from "../lib/context/scanner.mjs";
import { loadStaticContext } from "../lib/context/envelope.mjs";

test("init: generateProjectBlueprint outputs valid YAML frontmatter and landmarks", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vera-test-blueprint-"));
  try {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({
        name: "test-microservice",
        dependencies: { express: "^4.18.0", pg: "^8.11.0" },
        scripts: { test: "node --test", start: "node index.js" }
      })
    );
    fs.writeFileSync(path.join(tempDir, "index.js"), 'console.log("hello");');

    const blueprint = generateProjectBlueprint(tempDir);

    assert.ok(blueprint.startsWith("---"), "Must start with YAML frontmatter");
    assert.match(blueprint, /name: "test-microservice"/);
    assert.match(blueprint, /ecosystem: "node"/);
    assert.match(blueprint, /Express/);
    assert.match(blueprint, /PostgreSQL/);
    assert.match(blueprint, /scannerVersion: "2.2.0"/);
    assert.match(blueprint, /## 1. System Topology/);
    assert.match(blueprint, /## 5. Developer Directives/);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test("init: security scrub excludes .env and secret files from blueprint", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vera-test-security-"));
  try {
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "secure-app" })
    );
    fs.writeFileSync(path.join(tempDir, ".env"), "DATABASE_URL=postgres://secret@localhost");
    fs.writeFileSync(path.join(tempDir, "deploy.key"), "PRIVATE KEY DUMMY");
    fs.writeFileSync(path.join(tempDir, "server.js"), "const x = 1;");

    const blueprint = generateProjectBlueprint(tempDir);

    assert.ok(!blueprint.includes(".env"), "Must never leak .env in blueprint");
    assert.ok(!blueprint.includes("deploy.key"), "Must never leak .key files in blueprint");
    assert.match(blueprint, /server\.js/);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});

test("init: loadStaticContext reads .vera/project_context.md", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vera-test-static-"));
  try {
    const veraDir = path.join(tempDir, ".vera");
    fs.mkdirSync(veraDir, { recursive: true });
    const content = "# Test Project Blueprint\n## 5. Developer Directives\n- Invariant: No mock data";
    fs.writeFileSync(path.join(veraDir, "project_context.md"), content);

    const loaded = loadStaticContext(tempDir);
    assert.strictEqual(loaded, content);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
