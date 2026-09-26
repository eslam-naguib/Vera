import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { normalizeModelId, quarantineAndScrubPayload } from "../lib/debate/orchestrator.mjs";
import { getDebatePrompt, RED_HAT_SYSTEM_PROMPT, BLUE_HAT_SYSTEM_PROMPT } from "../lib/debate/personas.mjs";
import { 
  initDatabase, 
  recordDebateStart, 
  recordDebateRound, 
  recordDebateFinish, 
  getRecentDebates, 
  getDebateRounds 
} from "../lib/db.mjs";

test("debate: normalizeModelId correctly maps model aliases", () => {
  assert.strictEqual(normalizeModelId("astra"), "gpt-6-astra");
  assert.strictEqual(normalizeModelId("astra6"), "gpt-6-astra");
  assert.strictEqual(normalizeModelId("fable"), "claude-fable-5-1");
  assert.strictEqual(normalizeModelId("fable-5.1"), "claude-fable-5-1");
  assert.strictEqual(normalizeModelId("sol"), "gpt-5.6-sol");
  assert.strictEqual(normalizeModelId("terra"), "gpt-5.6-terra");
  assert.strictEqual(normalizeModelId("custom-model"), "custom-model");
});

test("debate: quarantineAndScrubPayload redacts active secrets and sensitive tokens", () => {
  const activeKey = "sk-live-secret-key-998877665544";
  const rawText = `Endpoint connects with ${activeKey} and postgres://admin:secretPass123@db.internal:5432/db`;

  const scrubbed = quarantineAndScrubPayload(rawText, [activeKey]);
  assert.ok(!scrubbed.includes(activeKey), "Active key should be scrubbed");
  assert.ok(scrubbed.includes("[REDACTED_SECRET]") || scrubbed.includes("[REDACTED_API_KEY]"));
  assert.ok(!scrubbed.includes("secretPass123"), "Database password should be scrubbed");
});

test("debate: getDebatePrompt enforces anti-sycophancy for challenger", () => {
  const challengerPrompt = getDebatePrompt("challenger", "homogeneous", "gpt-6-astra", "gpt-6-astra");
  assert.ok(challengerPrompt.includes("ممنوع المجاملة"), "Challenger prompt must strictly forbid flattery");
  assert.ok(challengerPrompt.includes("CRITICAL_DEFECT"), "Must require defect categorization");

  const proposerPrompt = getDebatePrompt("proposer", "heterogeneous", "gpt-6-astra", "claude-fable-5-1");
  assert.ok(proposerPrompt.includes("المعماري البرمجي الرئيسي"));
});

test("debate: records debate sessions and rounds in SQLite ledger", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "signor-debate-db-"));
  
  try {
    initDatabase(tempDir);

    const debateId = recordDebateStart({
      task: "Build real estate landing page",
      mode: "heterogeneous",
      rounds_count: 3,
      agent1_model: "gpt-6-astra",
      agent1_effort: "medium",
      agent1_hat: "blue",
      agent2_model: "claude-fable-5-1",
      agent2_effort: "medium",
      agent2_hat: "red",
    }, tempDir);

    assert.ok(debateId, "Debate ID should be generated");

    const r1Id = recordDebateRound({
      debate_id: debateId,
      round_number: 1,
      phase: "thesis",
      agent_role: "blue_hat",
      model_id: "gpt-6-astra",
      effort: "medium",
      content: "Proposal content...",
      duration_ms: 1200,
    }, tempDir);

    assert.ok(r1Id, "Round 1 ID should be generated");

    const r2Id = recordDebateRound({
      debate_id: debateId,
      round_number: 2,
      phase: "antithesis",
      agent_role: "red_hat",
      model_id: "claude-fable-5-1",
      effort: "medium",
      content: "Critique content...",
      duration_ms: 1500,
    }, tempDir);

    assert.ok(r2Id, "Round 2 ID should be generated");

    recordDebateFinish(debateId, "completed", 3500, ".signor/signor_plan.md", tempDir);

    const recent = getRecentDebates(5, tempDir);
    assert.strictEqual(recent.length, 1);
    assert.strictEqual(recent[0].id, debateId);
    assert.strictEqual(recent[0].status, "completed");

    const rounds = getDebateRounds(debateId, tempDir);
    assert.strictEqual(rounds.length, 2);
    assert.strictEqual(rounds[0].round_number, 1);
    assert.strictEqual(rounds[1].round_number, 2);
  } finally {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
});
