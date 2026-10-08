import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BRAND } from "../brand.mjs";

const SKILL_DEFINITIONS = {
  vera: {
    name: "vera",
    description: "Principal AI Architect & Code Engineer. Autonomous planning (/plan), adversarial debate (/debate), QA review (/review), security audit (/audit), auto-fix (/fix), and cockpit (/cockpit).",
    content: `---
name: vera
description: Principal AI Architect & Code Engineer. Autonomous planning (/plan), adversarial debate (/debate), QA review (/review), security audit (/audit), auto-fix (/fix), and cockpit (/cockpit).
---

# Vera AI — Principal AI Architect & Code Engineer

Use this skill whenever the developer invokes \`/vera\` or requests architectural planning, adversarial debates, code reviews against test suites, security audits, or automated fixes.

## Available Actions:
- \`/plan "<task>"\`: Generate architectural master blueprint and file breakdown.
- \`/debate "<task>"\`: Multi-agent adversarial duel (Red vs Blue Hat) stress-testing decisions.
- \`/review [path]\`: Inspect local Git diff against test suites and quality gates.
- \`/audit\`: Full-spectrum security, dependency, and database schema audit.
- \`/fix [issue]\`: Automatic remediation and code patches via staged change sets.
- \`/cockpit\`: Launch developer dashboard on http://localhost:5050.
`
  },

  plan: {
    name: "plan",
    description: "Generate comprehensive architectural master plan, component topology, and execution blueprint with Vera AI. Triggered via /plan \"<task>\".",
    content: `---
name: plan
description: Generate comprehensive architectural master plan, component topology, and execution blueprint with Vera AI. Triggered via /plan "<task>".
---

# Architectural Planning & Blueprint Generator (Vera AI)

Use this skill when the developer types \`/plan\` or asks for architectural planning.

## Execution
Run Vera plan command:
\`\`\`bash
vera plan "<task>"
\`\`\`
*(Fallback: \`node ./bin/vera.mjs plan "<task>"\`)*

Outputs are saved in \`.vera/vera_plan.md\` (or \`.signor/signor_plan.md\`).
`
  },

  debate: {
    name: "debate",
    description: "Conduct a multi-agent adversarial debate (Red Team vs Blue Team or cross-model duel) to stress-test architectural decisions and uncover blind spots. Triggered via /debate \"<task>\".",
    content: `---
name: debate
description: Conduct a multi-agent adversarial debate (Red Team vs Blue Team or cross-model duel) to stress-test architectural decisions and uncover blind spots. Triggered via /debate "<task>".
---

# Multi-Agent Architectural Debate (Vera AI)

Use this skill when the developer types \`/debate\` to stress-test design choices through adversarial dialectic.

## Execution
Run Vera debate command:
\`\`\`bash
vera debate "<task>" --hats --effort1 medium --effort2 medium
\`\`\`
Or cross-model:
\`\`\`bash
vera debate "<task>" --agent1 astra --agent2 fable
\`\`\`
`
  },

  review: {
    name: "review",
    description: "Inspect local Git diff against architectural requirements, run deterministic quality gates, and generate rigorous code review. Triggered via /review [path].",
    content: `---
name: review
description: Inspect local Git diff against architectural requirements, run deterministic quality gates, and generate rigorous code review. Triggered via /review [path].
---

# Code Review & Deterministic Quality Gate (Vera AI)

Use this skill when the developer types \`/review\` before committing code or submitting a PR.

## Execution
Run Vera review command:
\`\`\`bash
vera review
\`\`\`
Executes git diff extraction, runs deterministic test suites (Quality Gate), and streams the comprehensive review.
`
  },

  audit: {
    name: "audit",
    description: "Perform full-spectrum architectural, dependency, schema, and security vulnerability audit. Triggered via /audit.",
    content: `---
name: audit
description: Perform full-spectrum architectural, dependency, schema, and security vulnerability audit. Triggered via /audit.
---

# Full-Spectrum Security & Architectural Audit (Vera AI)

Use this skill when the developer types \`/audit\` for a deep security and codebase health check.

## Execution
Run Vera audit command:
\`\`\`bash
vera audit
\`\`\`
Scans repository topology, tests, security risks, SSRF, and dependency configurations.
`
  },

  fix: {
    name: "fix",
    description: "Automatically remediate code issues, test failures, or security findings using Vera AI staged change sets. Triggered via /fix [issue].",
    content: `---
name: fix
description: Automatically remediate code issues, test failures, or security findings using Vera AI staged change sets. Triggered via /fix [issue].
---

# Quality Remediation & Auto-Fix (Vera AI)

Use this skill when the developer types \`/fix\` to resolve issues discovered during review or audit.

## Execution
Ask Vera to inspect and stage code modifications:
\`\`\`bash
vera ask "قم بإصلاح العطل التالي وتعديل الكود المطلوب: <issue>"
\`\`\`
Review the staged colorized diff and confirm application to disk.
`
  },

  cockpit: {
    name: "cockpit",
    description: "Launch, inspect, or manage Vera AI Developer Cockpit Web Dashboard on http://localhost:5050. Triggered via /cockpit [start|status|stop].",
    content: `---
name: cockpit
description: Launch, inspect, or manage Vera AI Developer Cockpit Web Dashboard on http://localhost:5050. Triggered via /cockpit [start|status|stop].
---

# Vera Developer Cockpit Dashboard

Use this skill when the developer types \`/cockpit\` to launch the real-time visual dashboard.

## Execution
\`\`\`bash
vera cockpit start -d
\`\`\`
Directs developer to: http://localhost:5050
`
  }
};

export async function handleInstallSkill(args = []) {
  const isGlobal = args.includes("--global") || args.includes("-g") || true; // Install globally and in workspace
  const cwd = process.cwd();

  const installTargets = [];

  // Workspace target (.agents/skills/)
  const workspaceSkills = path.join(cwd, ".agents", "skills");
  installTargets.push(workspaceSkills);

  // Global Antigravity targets
  const userHome = os.homedir();
  const globalGemini = path.join(userHome, ".gemini", "antigravity", "skills");
  installTargets.push(globalGemini);

  console.log(`\n\x1b[1m\x1b[35m⚡ [Vera AI] تثبيت وتفعيل حزمة Antigravity Skills & Slash Commands\x1b[0m\n`);

  let installedCount = 0;

  for (const targetBase of installTargets) {
    if (!fs.existsSync(targetBase)) {
      try { fs.mkdirSync(targetBase, { recursive: true }); } catch {}
    }

    for (const [skillKey, skillDef] of Object.entries(SKILL_DEFINITIONS)) {
      const skillDir = path.join(targetBase, skillKey);
      if (!fs.existsSync(skillDir)) {
        try { fs.mkdirSync(skillDir, { recursive: true }); } catch {}
      }
      const skillFile = path.join(skillDir, "SKILL.md");
      fs.writeFileSync(skillFile, skillDef.content.trim() + "\n", "utf-8");
      installedCount++;
    }
  }

  console.log(`\x1b[32m✔ تم تثبيت وتفعيل ${Object.keys(SKILL_DEFINITIONS).length} مهارات رئيسية بنجاح!\x1b[0m`);
  console.log(`\n\x1b[33mالأوامر التفاعلية المتاحة فوراً عند كتابة '/' في الشات:\x1b[0m`);
  console.log(`  \x1b[36m/vera\x1b[0m       — الموجه والمعماري الرئيسي`);
  console.log(`  \x1b[36m/plan\x1b[0m       — بناء المخطط المعماري الشامل وتفكيك الملفات`);
  console.log(`  \x1b[36m/debate\x1b[0m     — المناظرة المعمارية بين وكيلين (Red vs Blue Hat)`);
  console.log(`  \x1b[36m/review\x1b[0m     — فحص الـ Diff وبوابة الجودة والاختبارات`);
  console.log(`  \x1b[36m/audit\x1b[0m      — التدقيق الأمني وهيكل المنظومة`);
  console.log(`  \x1b[36m/fix\x1b[0m        — التصحيح التلقائي وتطبيق الـ Patches`);
  console.log(`  \x1b[36m/cockpit\x1b[0m    — تشغيل لوحة التحكم على http://localhost:5050\n`);

  return { success: true, count: installedCount };
}
