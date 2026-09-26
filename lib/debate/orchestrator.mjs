import fs from "node:fs";
import path from "node:path";
import { callSignor } from "../engine.mjs";
import { atomicWriteFileSync } from "../atomic.mjs";
import { 
  recordDebateStart, 
  recordDebateRound, 
  recordDebateFinish, 
  recordArtifact 
} from "../db.mjs";
import { getDebatePrompt } from "./personas.mjs";

/**
 * Normalizes model aliases to verified IDs on Signor Gateway.
 */
export function normalizeModelId(raw) {
  if (!raw || typeof raw !== "string") return "gpt-5.6-sol";
  const lower = raw.trim().toLowerCase();
  
  if (lower === "astra" || lower === "astra6" || lower === "gpt-6-astra" || lower === "gpt6-astra") {
    return "gpt-6-astra";
  }
  if (lower === "fable" || lower === "fable5.1" || lower === "fable-5.1" || lower === "claude-fable-5-1" || lower === "claude-fable") {
    return "claude-fable-5-1";
  }
  if (lower === "sol" || lower === "sol5.6" || lower === "gpt-5.6-sol" || lower === "gpt5.6-sol") {
    return "gpt-5.6-sol";
  }
  if (lower === "terra" || lower === "terra5.6" || lower === "gpt-5.6-terra" || lower === "gpt5.6-terra") {
    return "gpt-5.6-terra";
  }
  if (lower === "luna" || lower === "gpt-5.6-luna" || lower === "gpt-6-luna") {
    return "gpt-6-luna";
  }
  if (lower === "opus" || lower === "claude-opus-5") {
    return "claude-opus-5";
  }
  if (lower === "sonnet" || lower === "claude-sonnet-5") {
    return "claude-sonnet-5";
  }
  if (lower === "gemini" || lower === "gemini-flash" || lower === "gemini-3.8-flash") {
    return "gemini-3.8-flash";
  }

  return raw.trim();
}

/**
 * Scrubs active secrets and sensitive tokens from cross-agent text payloads.
 */
export function quarantineAndScrubPayload(text, activeSecrets = []) {
  if (typeof text !== "string") return "";
  let scrubbed = text;

  // Scrub known active secrets
  for (const s of activeSecrets) {
    if (s && s.length >= 6) {
      scrubbed = scrubbed.replaceAll(s, "[REDACTED_SECRET]");
    }
  }

  // Scrub standard API keys and credentials
  scrubbed = scrubbed.replace(/sk-[a-zA-Z0-9_-]{20,}/g, "[REDACTED_API_KEY]");
  scrubbed = scrubbed.replace(/gh[pousr]_[A-Za-z0-9_]{30,}/g, "[REDACTED_GITHUB_TOKEN]");
  scrubbed = scrubbed.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[REDACTED_JWT]");
  scrubbed = scrubbed.replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]");
  scrubbed = scrubbed.replace(/(postgres|mysql|mongodb):\/\/[^:]+:[^@]+@/g, "$1://[REDACTED_AUTH]@");

  return scrubbed;
}

/**
 * Runs a complete 3-round Multi-Agent Dialectical Debate Session.
 */
export async function runDebateSession(task, options = {}, baseConfig = {}) {
  const cwd = options.projectDir || process.cwd();
  const overallStart = Date.now();

  const model1 = normalizeModelId(options.agent1 || baseConfig.model || "gpt-6-astra");
  const model2 = normalizeModelId(options.agent2 || options.agent1 || baseConfig.model || "gpt-6-astra");
  const provider1 = (options.provider1 || options.agent1Provider || baseConfig.provider_id || "signor").trim().toLowerCase();
  const provider2 = (options.provider2 || options.agent2Provider || options.provider1 || baseConfig.provider_id || "signor").trim().toLowerCase();
  const synthProvider = (options.synthProvider || options.synthesizerProvider || provider1).trim().toLowerCase();

  const effort1 = options.effort1 || baseConfig.effort || "medium";
  const effort2 = options.effort2 || baseConfig.effort || "medium";
  const synthEffort = options.synthEffort || "high";

  const isHomogeneous = Boolean(options.hats) || (model1 === model2 && provider1 === provider2);
  const mode = isHomogeneous ? "homogeneous" : "heterogeneous";

  const agent1Hat = isHomogeneous ? "blue_hat" : "architect";
  const agent2Hat = isHomogeneous ? "red_hat" : "critic";

  const agent1Label = isHomogeneous ? `${model1} (القبعة الزرقاء - ${provider1})` : `${model1} (${provider1})`;
  const agent2Label = isHomogeneous ? `${model2} (القبعة الحمراء - ${provider2})` : `${model2} (${provider2})`;

  console.log(`\n⚔️  \x1b[1m[Signor AI] بدء جلسة المناظرة المعمارية متعددة الوكلاء (Debate Engine)\x1b[0m`);
  console.log(`   النمط:        \x1b[35m${mode === "homogeneous" ? "القبعات المتناظرة (Red vs Blue Hat)" : "تعدد النماذج والمزودين (Multi-Provider Duel)"}\x1b[0m`);
  console.log(`   الطرف الأول:  \x1b[34m${model1}\x1b[0m (المزود: \x1b[36m${provider1}\x1b[0m | Effort: ${effort1})`);
  console.log(`   الطرف الثاني:  \x1b[31m${model2}\x1b[0m (المزود: \x1b[36m${provider2}\x1b[0m | Effort: ${effort2})`);
  console.log(`   المهمة:       "${task.slice(0, 90)}${task.length > 90 ? "..." : ""}"\n`);

  // Start DB record (< 1ms micro-transaction)
  let debateId = null;
  try {
    debateId = recordDebateStart({
      task,
      mode,
      rounds_count: 3,
      agent1_model: `${provider1}:${model1}`,
      agent1_effort: effort1,
      agent1_hat: agent1Hat,
      agent2_model: `${provider2}:${model2}`,
      agent2_effort: effort2,
      agent2_hat: agent2Hat,
    }, cwd);
  } catch {}

  const activeSecrets = [baseConfig.api_key].filter(Boolean);

  // -------------------------------------------------------------
  // ROUND 1: THESIS (Proposer / Blue Hat)
  // -------------------------------------------------------------
  console.log(`\x1b[1m\x1b[34m[🔵 الجولة 1/3: مقترح المعماري الأساسي (Thesis — ${agent1Label})]\x1b[0m`);
  console.log(`\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);
  const r1Start = Date.now();

  const cfg1 = { ...baseConfig, model: model1, effort: effort1, provider_id: provider1 };
  const r1SystemPrompt = getDebatePrompt("proposer", mode, `${provider1}:${model1}`, `${provider2}:${model2}`);
  const r1UserPrompt = `المهمة المعمارية والتخطيطية المطلوبة:
${task}

قم بوضع المقترح المعماري الأولي الشامل والمفصل باللغة العربية بصيغة Markdown، بأسلوب منظم ومركز (بحدود 1000 كلمة) يغطي هيكلية النظام، مسار البيانات، النماذج، والواجهات، لتسليم الراية للطرف الثاني للنقد.`;

  let round1Proposal = "";
  try {
    round1Proposal = await callSignor([
      { role: "system", content: r1SystemPrompt },
      { role: "user", content: r1UserPrompt }
    ], {
      stream: true,
      provider: provider1,
      max_tokens: options.max_tokens1 || 2500,
      enableTools: options.enableTools ?? false,
      kind: "debate_round_1",
      projectDir: cwd,
    }, cfg1);
  } catch (err) {
    console.error(`\n❌ فشلت الجولة الأولى (Thesis):`, err.message);
    try { if (debateId) recordDebateFinish(debateId, "failed", Date.now() - overallStart, null, cwd); } catch {}
    throw err;
  }

  const r1Duration = Date.now() - r1Start;
  console.log(`\n\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);
  console.log(`\x1b[32m✔ اكتملت الجولة الأولى في ${(r1Duration / 1000).toFixed(1)}s\x1b[0m\n`);

  try {
    if (debateId) {
      recordDebateRound({
        debate_id: debateId,
        round_number: 1,
        phase: "thesis",
        agent_role: agent1Hat,
        model_id: model1,
        effort: effort1,
        content: round1Proposal,
        duration_ms: r1Duration,
      }, cwd);
    }
  } catch {}

  // -------------------------------------------------------------
  // ROUND 2: ANTITHESIS (Adversary / Red Hat)
  // -------------------------------------------------------------
  console.log(`\x1b[1m\x1b[31m[🔴 الجولة 2/3: فحص ونقد محامي الشيطان الصارم (Antithesis — ${agent2Label})]\x1b[0m`);
  console.log(`\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);
  const r2Start = Date.now();

  const cfg2 = { ...baseConfig, model: model2, effort: effort2, provider_id: provider2 };
  const r2SystemPrompt = getDebatePrompt("challenger", mode, `${provider2}:${model2}`, `${provider1}:${model1}`);
  const scrubbedThesis = quarantineAndScrubPayload(round1Proposal, activeSecrets);

  const r2UserPrompt = `المهمة الأصلية المطلوبة:
${task}

المقترح المعماري المقدم من الطرف الأول (${agent1Label}):
${scrubbedThesis}

المطلوب منك كمدقق وناقد معماري صارم:
فحص المقترح أعلاه بدقة استثنائية دون مجاملة، واستخراج كافة العيوب، مشاكل التزامن، ثغرات الأمان، ومشاكل الأداء في نقاط محددة مباشرة (بحدود 600 - 800 كلمة) مع تحديد التعديلات الإلزامية المطلوبة.`;

  let round2Critique = "";
  try {
    round2Critique = await callSignor([
      { role: "system", content: r2SystemPrompt },
      { role: "user", content: r2UserPrompt }
    ], {
      stream: true,
      provider: provider2,
      max_tokens: options.max_tokens2 || 1500,
      enableTools: false,
      kind: "debate_round_2",
      projectDir: cwd,
    }, cfg2);
  } catch (err) {
    console.warn(`\n⚠️ تعثرت الجولة الثانية من الطرف الثاني (${err.message}). تطبيق صمام التعافي الآلي (Fail-Functional Fallback)...`);
    round2Critique = `[ملاحظة النظام]: تعذر استكمال فحص الطرف الثاني بسبب (${err.message}). تم تمرير المقترح للمرحلة النهائية مع تطبيق التدقيق الذاتي.`;
  }

  const r2Duration = Date.now() - r2Start;
  console.log(`\n\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);
  console.log(`\x1b[32m✔ اكتملت الجولة الثانية في ${(r2Duration / 1000).toFixed(1)}s\x1b[0m\n`);

  try {
    if (debateId) {
      recordDebateRound({
        debate_id: debateId,
        round_number: 2,
        phase: "antithesis",
        agent_role: agent2Hat,
        model_id: model2,
        effort: effort2,
        content: round2Critique,
        duration_ms: r2Duration,
      }, cwd);
    }
  } catch {}

  // -------------------------------------------------------------
  // ROUND 3: SYNTHESIS (Master Plan Consensus)
  // -------------------------------------------------------------
  const synthModel = normalizeModelId(options.synthesizer || model1);
  console.log(`\x1b[1m\x1b[32m[⚖️ الجولة 3/3: التوليف وحسم الخلاف واعتماد الخطة النهائية (Synthesis — ${synthModel})]\x1b[0m`);
  console.log(`\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);
  const r3Start = Date.now();

  const cfgSynth = { ...baseConfig, model: synthModel, effort: synthEffort, provider_id: synthProvider };
  const r3SystemPrompt = getDebatePrompt("synthesizer", mode, `${synthProvider}:${synthModel}`, "");
  const scrubbedCritique = quarantineAndScrubPayload(round2Critique, activeSecrets);

  const r3UserPrompt = `المهمة الأصلية المطلوبة:
${task}

1. المقترح الأولي للمعماري الأول (${agent1Label}):
${scrubbedThesis}

2. نقد وتدقيق الطرف الثاني (${agent2Label}):
${scrubbedCritique}

المطلوب منك كـ Chief Technology Officer & Master Synthesizer:
قم بالتحكيم الموضوعي وتفنيد النقاط، وتبني كافة التحصينات الأمنية ومعالجات الأداء المقترحة، واكتب الخطة المعمارية والتنفيذية النهائية المعتمدة (Master Plan) باللغة العربية بصيغة Markdown كاملة ومفصلة بدون أي Mock Data وبأسلوب مباشر جاهز للتنفيذ.`;

  let finalSynthesis = "";
  try {
    finalSynthesis = await callSignor([
      { role: "system", content: r3SystemPrompt },
      { role: "user", content: r3UserPrompt }
    ], {
      stream: true,
      provider: synthProvider,
      max_tokens: options.max_tokens3 || 3000,
      enableTools: false,
      kind: "debate_round_3",
      projectDir: cwd,
    }, cfgSynth);
  } catch (err) {
    console.error(`\n❌ فشلت جولة التوليف (Synthesis):`, err.message);
    throw err;
  }

  const r3Duration = Date.now() - r3Start;
  console.log(`\n\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);
  console.log(`\x1b[32m✔ اكتملت جولة التوليف في ${(r3Duration / 1000).toFixed(1)}s\x1b[0m\n`);

  try {
    if (debateId) {
      recordDebateRound({
        debate_id: debateId,
        round_number: 3,
        phase: "synthesis",
        agent_role: "master_synthesizer",
        model_id: synthModel,
        effort: synthEffort,
        content: finalSynthesis,
        duration_ms: r3Duration,
      }, cwd);
    }
  } catch {}

  // -------------------------------------------------------------
  // SAVE ARTIFACTS
  // -------------------------------------------------------------
  const signorDir = path.join(cwd, ".signor");
  const plansDir = path.join(signorDir, "plans");
  if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const debateTranscriptPath = path.join(plansDir, `debate-${timestamp}.md`);
  const mainPlanPath = path.join(signorDir, "signor_plan.md");

  const fullTranscriptMarkdown = `# ⚔️ محضر جلسة المناظرة المعمارية — Signor AI Debate Engine

- **المهمة:** ${task}
- **التاريخ:** ${new Date().toLocaleString("ar-EG")}
- **النمط:** ${mode === "homogeneous" ? "مناظرة القبعات المتناظرة (Red vs Blue Hat)" : "مناظرة النماذج المتعددة (Multi-Model Duel)"}
- **الطرف الأول:** \`${model1}\` (${effort1}) — ${agent1Hat}
- **الطرف الثاني:** \`${model2}\` (${effort2}) — ${agent2Hat}
- **نموذج التوليف:** \`${synthModel}\` (${synthEffort})
- **المدة الإجمالية:** ${((Date.now() - overallStart) / 1000).toFixed(1)}s

---

## 🔵 الجولة الأولى: مقترح المعماري المبدئي (Thesis)
*الموديل:* \`${model1}\`

${round1Proposal}

---

## 🔴 الجولة الثانية: فحص ونقد محامي الشيطان (Antithesis)
*الموديل:* \`${model2}\`

${round2Critique}

---

## ⚖️ الجولة الثالثة: الخطة المعمارية المعتمدة النهائية (Synthesis Master Plan)
*الموديل:* \`${synthModel}\`

${finalSynthesis}
`;

  const authoritativeMasterPlan = `# الخطة المعمارية المعتمدة (المستخلصة عبر المناظرة المعمارية)

- **التاريخ:** ${new Date().toLocaleString("ar-EG")}
- **المهمة:** ${task}
- **محرك التوليد:** Signor Multi-Agent Debate Engine (\`${model1}\` ⚔️ \`${model2}\`)
- **النموذج المحكم:** \`${synthModel}\` (${synthEffort})
- **سجل المناظرة الكامل:** \`.signor/plans/debate-${timestamp}.md\`

---

${finalSynthesis}
`;

  atomicWriteFileSync(debateTranscriptPath, fullTranscriptMarkdown);
  atomicWriteFileSync(mainPlanPath, authoritativeMasterPlan);

  try {
    recordArtifact(null, "debate_transcript", `.signor/plans/debate-${timestamp}.md`, debateTranscriptPath, cwd);
    recordArtifact(null, "plan", ".signor/signor_plan.md", mainPlanPath, cwd);
    if (debateId) {
      recordDebateFinish(debateId, "completed", Date.now() - overallStart, mainPlanPath, cwd);
    }
  } catch {}

  // Also mirror to sol/ if present for compatibility
  const solDir = path.join(cwd, "sol");
  if (fs.existsSync(solDir)) {
    atomicWriteFileSync(path.join(solDir, "sol_plan.md"), authoritativeMasterPlan);
  }

  const totalTimeSec = ((Date.now() - overallStart) / 1000).toFixed(1);
  console.log(`\n🎉 \x1b[32m\x1b[1mاكتملت المناظرة المعمارية بنجاح في ${totalTimeSec} ثانية!\x1b[0m`);
  console.log(`📄 الخطة النهائية المعتمدة:  \x1b[36m.signor/signor_plan.md\x1b[0m`);
  console.log(`📁 أرشيف تفاصيل المناظرة:    \x1b[33m.signor/plans/debate-${timestamp}.md\x1b[0m\n`);

  return {
    debateId,
    masterPlan: finalSynthesis,
    transcriptPath: debateTranscriptPath,
    planPath: mainPlanPath,
    durationMs: Date.now() - overallStart,
  };
}
