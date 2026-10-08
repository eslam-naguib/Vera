import fs from "node:fs";
import path from "node:path";
import { callSignor } from "../engine.mjs";
import { atomicWriteFileSync } from "../atomic.mjs";
import { recordArtifact } from "../db.mjs";
import { runDeterministicQualityGate } from "./review.mjs";
import { scanProjectIdentity, buildCompactFileTree } from "../context/index.mjs";

export function scanProjectTopology(projectDir) {
  const start = Date.now();
  const identity = scanProjectIdentity(projectDir);
  const tree = buildCompactFileTree(projectDir);

  const summary = {
    ecosystem: identity.ecosystem,
    frameworks: identity.frameworks,
    databases: identity.databases,
    packages: identity.isMonorepo ? [identity.name, "monorepo-workspace"] : [identity.name],
    configs: tree.configs,
    schemas: tree.schemas,
    routes: tree.routes || [],
    durationMs: Date.now() - start,
  };

  return summary;
}

export async function handleAudit(args, config) {
  const cwd = process.cwd();
  const overallStart = Date.now();

  console.log(`\n🔬 \x1b[1m[Signor Lead Auditor] Commencing Full-Spectrum System Audit\x1b[0m`);
  console.log(`   Model:  \x1b[36m${config.model}\x1b[0m`);
  console.log(`   Effort: \x1b[33m${config.effort}\x1b[0m\n`);

  // Milestone 1: Topology Scan (< 30ms)
  process.stdout.write(`  [1/3] 🌐 Scanning repository topology & architecture... `);
  const topology = scanProjectTopology(cwd);
  console.log(`\x1b[32mDone in ${topology.durationMs}ms\x1b[0m`);
  console.log(`        Detected Packages: ${topology.packages.join(", ") || "Single Package"}`);
  console.log(`        Detected Configs:  ${topology.configs.join(", ") || "Default"}`);

  // Milestone 2: Deterministic Quality Gate (< 200ms)
  process.stdout.write(`  [2/3] 🧪 Running deterministic Quality Gate test suite... `);
  const gateResult = runDeterministicQualityGate(cwd);
  if (gateResult.hasTests) {
    if (gateResult.passed) {
      console.log(`\x1b[32mPASSED (Exit code: 0 in ${gateResult.durationMs}ms)\x1b[0m`);
    } else {
      console.log(`\x1b[31mFAILED (Exit code: ${gateResult.exitCode} in ${gateResult.durationMs}ms)\x1b[0m`);
    }
  } else {
    console.log(`\x1b[33mNO TESTS FOUND (Fail-closed)\x1b[0m`);
  }

  // Milestone 3: Live Streaming Audit via gpt-5.6-sol
  console.log(`  [3/3] 🧠 Streaming live full-spectrum audit via \x1b[36m${config.model}\x1b[0m...\n`);
  console.log(`\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);

  const systemPrompt = `You are Signor (powered by ${config.model}), Principal System Auditor & Enterprise Architect.
Conduct a rigorous, full-spectrum architectural, security, performance, and data integrity audit in professional Arabic.
Deliver your assessment with concrete architectural ratings, zero tolerance for mock data, and strict ACID transaction analysis.`;

  const userPrompt = `مطلوب إجراء تدقيق معماري وتقني شامل للنظام:

معلومات هيكلية النظام والطرود (Project Topology):
- الطرود والمكونات المكتشفة: ${topology.packages.join(", ")}
- ملفات التهيئة: ${topology.configs.join(", ")}

نتائج بوابة الجودة الآلية (Deterministic Quality Gate):
- Has Tests: ${gateResult.hasTests}
- Passed: ${gateResult.passed}
- Exit Code: ${gateResult.exitCode ?? 0}
- Raw Output:
\`\`\`
${gateResult.output}
\`\`\`

المطلوب:
أصدر التقرير الشامل متضمناً:
1. ملخص التدقيق التنفيذي والقرار النهائي الصارم.
2. فحص المنطق التجاري ونموذج البيانات والـ Transactions (ACID & Concurrency).
3. فحص الأمان وإدارة الأسرار، وعزل البيانات (Secret Store & SSRF Protection).
4. فحص الأداء والتحكم في الاستهلاك والـ Streaming.
5. جدول الملاحظات والتوصيات الفنية ذات الأولوية مع التقييم النهائي من 10.`;

  try {
    const auditReport = await callSignor([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], {
      enableTools: false, // Fast deterministic streaming pipeline
      stream: true,        // Real-time token streaming
      kind: "audit",
      projectDir: cwd,
    }, config);

    console.log(`\n\x1b[90m--------------------------------------------------------------------------------\x1b[0m\n`);

    const signorDir = path.join(cwd, ".signor");
    if (!fs.existsSync(signorDir)) fs.mkdirSync(signorDir, { recursive: true });
    const auditPath = path.join(signorDir, "signor_audit.md");
    const content = `# تقرير التدقيق المعماري والفحص الشامل — Signor (Lead Auditor)\n\n- **التاريخ:** ${new Date().toLocaleString("ar-EG")}\n- **النموذج:** \`${config.model}\`\n- **بوابة الجودة:** ${gateResult.passed ? "✅ اجتازت بنجاح" : "❌ فشلت الاختبارات"}\n- **زمن التنفيذ الإجمالي:** ${((Date.now() - overallStart) / 1000).toFixed(1)}s\n\n---\n\n${auditReport}\n`;
    atomicWriteFileSync(auditPath, content);
    try { recordArtifact(null, "audit", ".signor/signor_audit.md", auditPath, cwd); } catch {}

    console.log(`⚡ \x1b[32m\x1b[1mAudit completed successfully in ${((Date.now() - overallStart) / 1000).toFixed(1)}s!\x1b[0m`);
    console.log(`📄 Saved to: .signor/signor_audit.md\n`);
  } catch (err) {
    console.error("\n❌ Audit failed:", err.message);
    process.exit(1);
  }
}

