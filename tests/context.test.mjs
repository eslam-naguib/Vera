import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import { 
  scanProjectIdentity, 
  buildCompactFileTree, 
  buildProjectContext, 
  formatEnvelopeForPrompt,
  injectProjectContext 
} from "../lib/context/index.mjs";

test("context: scanProjectIdentity detects node ecosystem and current project", () => {
  const identity = scanProjectIdentity(process.cwd());
  assert.ok(identity.name === "vera" || identity.name === "signor");
  assert.strictEqual(identity.ecosystem, "node");
  assert.ok(identity.languages.includes("JavaScript"));
  assert.ok(identity.languages.includes("TypeScript"));
  assert.ok(identity.scanDurationMs < 100, `Scanner took ${identity.scanDurationMs}ms, should be fast`);
});

test("context: buildCompactFileTree ignores node_modules and extracts landmarks", () => {
  const tree = buildCompactFileTree(process.cwd());
  assert.ok(tree.paths.length > 0);
  assert.ok(!tree.paths.some(p => p.startsWith("node_modules/")));
  assert.ok(!tree.paths.some(p => p.startsWith(".git/")));
  assert.ok(tree.configs.length > 0);
  assert.ok(tree.entrypoints.length > 0);
});

test("context: buildProjectContext generates bounded markdown envelope < 800 tokens", () => {
  const envelope = buildProjectContext(process.cwd());
  assert.ok(envelope.formattedPrompt.includes("سياق المشروع الحقيقي"));
  assert.ok(envelope.formattedPrompt.includes("signor"));
  assert.ok(envelope.tokenEstimate > 50);
  assert.ok(envelope.tokenEstimate <= 800, `Token estimate ${envelope.tokenEstimate} exceeds 800 tokens`);
});

test("context: injectProjectContext injects context into chat messages", () => {
  const baseMessages = [
    { role: "system", content: "You are Signor Architect." },
    { role: "user", content: "Design the database." }
  ];

  const injected = injectProjectContext(baseMessages, process.cwd());
  assert.strictEqual(injected.length, 2);
  assert.ok(injected[0].content.includes("You are Signor Architect."));
  assert.ok(injected[0].content.includes("سياق المشروع الحقيقي"));
});
