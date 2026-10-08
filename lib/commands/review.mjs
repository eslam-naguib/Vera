import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { callSignor } from "../engine.mjs";
import { recordArtifact, recordQualityGate } from "../db.mjs";
import { atomicWriteFileSync } from "../atomic.mjs";

export function runDeterministicQualityGate(projectDir = process.cwd(), customRunner = null) {
  const pkgPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { hasTests: false, passed: false, exitCode: 1, durationMs: 0, output: "No package.json detected in root (Gate fail-closed)." };
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (!pkg.scripts || !pkg.scripts.test) {
      return { hasTests: false, passed: false, exitCode: 1, durationMs: 0, output: "No 'test' script defined in package.json (Gate fail-closed)." };
    }

    if (typeof customRunner === "function") {
      return customRunner(projectDir, pkg);
    }

    const startTest = Date.now();
    const localRunAll = path.join(projectDir, "tests", "run_all.mjs");
    const monorepoRunAll = path.join(projectDir, "packages", "signor", "tests", "run_all.mjs");
    let cmd, args;
    const spawnOpts = {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 30000,
      windowsHide: true,
    };

    if (fs.existsSync(localRunAll)) {
      cmd = process.execPath;
      args = ["--test", localRunAll];
    } else if (fs.existsSync(monorepoRunAll)) {
      cmd = process.execPath;
      args = ["--test", monorepoRunAll];
    } else {
      cmd = process.platform === "win32" ? "npm.cmd" : "npm";
      args = ["test", "--silent"];
      if (process.platform === "win32") {
        spawnOpts.shell = true;
      }
    }

    const res = spawnSync(cmd, args, spawnOpts);

    const durationMs = Date.now() - startTest;
    const passed = res.status === 0;
    const output = ((res.stdout || "") + (res.stderr || "") + (res.error ? `\n${res.error.message}` : "")).trim();
    return {
      hasTests: true,
      passed,
      exitCode: res.status ?? 1,
      durationMs,
      output: output.slice(0, 2500),
    };
  } catch (err) {
    return { hasTests: true, passed: false, exitCode: 1, durationMs: 0, output: err.message };
  }
}

export function extractGitContext(projectDir, targetScope = "") {
  const start = Date.now();
  let gitAvailable = false;
  let branch = "unknown";
  let statusSummary = "";
  let diffStat = "";
  let diffContent = "";

  const gitEnv = { ...process.env, GIT_PAGER: "cat", PAGER: "cat" };
  const runGit = (args, timeout = 3000) => {
    return spawnSync("git", ["--no-pager", ...args], {
      cwd: projectDir,
      encoding: "utf-8",
      timeout,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: gitEnv,
    });
  };

  try {
    const branchRes = runGit(["branch", "--show-current"], 2000);
    if (branchRes.status === 0) {
      gitAvailable = true;
      branch = (branchRes.stdout || "").trim() || "HEAD";

      // Status
      const statusArgs = targetScope ? ["status", "--porcelain", targetScope] : ["status", "--porcelain"];
      const statusRes = runGit(statusArgs, 2000);
      statusSummary = (statusRes.stdout || "").trim();

      // Diff stat
      const diffStatArgs = targetScope ? ["diff", "--stat", "HEAD", "--", targetScope] : ["diff", "--stat"];
      const diffStatRes = runGit(diffStatArgs, 2000);
      diffStat = (diffStatRes.stdout || "").trim();

      // Working tree & staged diff
      const diffArgs = targetScope ? ["diff", "HEAD", "--", targetScope] : ["diff", "HEAD"];
      let diffRes = runGit(diffArgs, 3000);
      diffContent = (diffRes.stdout || "").trim();

      // If clean against HEAD, check the latest commit
      if (!diffContent) {
        const lastCommitDiff = runGit(["diff", "HEAD~1..HEAD", "--stat"], 2000);
        if (lastCommitDiff.status === 0 && lastCommitDiff.stdout.trim()) {
          diffStat = "Last Commit:\n" + lastCommitDiff.stdout.trim();
          const patch = runGit(["diff", "HEAD~1..HEAD"], 3000);
          diffContent = (patch.stdout || "").trim();
        }
      }
    }
  } catch {}

  // Cap diff content to 40KB (~10k tokens) to prevent latency spikes
  const maxDiffBytes = 40 * 1024;
  let truncated = false;
  if (diffContent.length > maxDiffBytes) {
    diffContent = diffContent.slice(0, maxDiffBytes) + "\n\n... [Diff truncated to 40KB for optimal latency]";
    truncated = true;
  }

  return {
    gitAvailable,
    branch,
    statusSummary,
    diffStat,
    diffContent,
    truncated,
    durationMs: Date.now() - start,
  };
}

export async function handleReview(args, config) {
  const cwd = process.cwd();
  const targetScope = (args && args[0]) ? args[0].replace(/^[./\\]+/, "") : "";
  const overallStart = Date.now();

  console.log(`\n🔍 \x1b[1m[Signor QA Lead] Starting Deterministic Code Review Pipeline\x1b[0m`);
  console.log(`   Scope:  \x1b[35m${targetScope || "Entire Project"}\x1b[0m`);
  console.log(`   Model:  \x1b[36m${config.model}\x1b[0m`);
  console.log(`   Effort: \x1b[33m${config.effort}\x1b[0m\n`);

  // Milestone 1: Extract Git & Delta Context locally (< 50ms)
  process.stdout.write(`  [1/3] 📂 Scanning repository delta & Git status... `);
  const gitContext = extractGitContext(cwd, targetScope);
  console.log(`\x1b[32mDone in ${gitContext.durationMs}ms\x1b[0m`);
  if (gitContext.gitAvailable) {
    console.log(`        Branch: ${gitContext.branch} | Status: ${gitContext.statusSummary ? gitContext.statusSummary.split("\n").length + " modified files" : "Clean tree"}`);
    if (gitContext.diffStat) {
      console.log(`        Summary:\n${gitContext.diffStat.split("\n").slice(0, 5).map(l => "          " + l).join("\n")}`);
    }
  }

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

  try {
    recordQualityGate(null, gateResult, cwd);
  } catch {}

  // Locate existing approved plan
  let planContent = "No plan found.";
  const candidatePlans = [
    path.join(cwd, ".signor", "signor_plan.md"),
    path.join(cwd, "sol", "sol_plan.md"),
    path.join(cwd, "sol_plan.md"),
  ];
  for (const p of candidatePlans) {
    if (fs.existsSync(p)) {
      planContent = fs.readFileSync(p, "utf-8").slice(0, 4000);
      break;
    }
  }

  // If Git diff is empty, gather key files in target scope to give model concrete code
  let supplementalCode = "";
  if (!gitContext.diffContent && targetScope) {
    const targetFull = path.join(cwd, targetScope);
    if (fs.existsSync(targetFull) && fs.statSync(targetFull).isDirectory()) {
      const sampleFiles = ["package.json", "lib/engine.mjs", "lib/security.mjs", "lib/db.mjs", "lib/secrets.mjs"];
      const gathered = [];
      for (const f of sampleFiles) {
        const fp = path.join(targetFull, f);
        if (fs.existsSync(fp)) {
          gathered.push(`// --- FILE: ${targetScope}/${f} ---\n` + fs.readFileSync(fp, "utf-8").slice(0, 3000));
        }
      }
      supplementalCode = gathered.join("\n\n");
    }
  }

  // Milestone 3: Live Streaming Review with gpt-5.6-sol
  console.log(`  [3/3] 🧠 Streaming live architectural review via \x1b[36m${config.model}\x1b[0m...\n`);
  console.log(`\x1b[90m--------------------------------------------------------------------------------\x1b[0m`);

  const systemPrompt = `You are Signor (powered by ${config.model}), Principal QA Reviewer & Chief Software Auditor.
Conduct a rigorous, production-grade architectural and code quality review in fluent, professional Arabic.
Key Review Rules:
1. Verify adherence to the approved architectural plan.
2. Verify zero mock data, type safety, database transactions (ACID), and security (SSRF, paths, secret protection).
3. Deterministic Gate Rule: If automated tests failed, you CANNOT approve. You MUST issue: VERDICT: CHANGES REQUIRED.
4. If all tests passed and architectural standards are met, issue: VERDICT: APPROVED 100%.`;

  const userPrompt = `خطة التنفيذ المعمارية المعتمدة (Architectural Plan):
${planContent}

نتائج بوابة الجودة الآلية (Deterministic Quality Gate Output):
- Has Tests: ${gateResult.hasTests}
- Passed: ${gateResult.passed}
- Exit Code: ${gateResult.exitCode ?? 0}
- Duration: ${gateResult.durationMs}ms
- Raw Output Snippet:
\`\`\`
${gateResult.output}
\`\`\`

فروقات الكود والملفات المعدلة (Code Delta & Diff):
\`\`\`diff
${gitContext.diffContent || (supplementalCode ? supplementalCode : "No git diff detected. Repository is on a clean state.")}
\`\`\`

${gateResult.passed ? "" : "⚠️ تحذير صارم: فشلت الاختبارات الآلية للمشروع. لا يُسمح بإصدار VERDICT: APPROVED 100% ويجب إصدار VERDICT: CHANGES REQUIRED مع توضيح سبب فشل الاختبارات."}

المهمة المطلوبة:
أصدر تقرير مراجعة كود شامل ودقيق واحترافي بصيغة Markdown باللغة العربية يتضمن:
1. الملخص التنفيذي للمراجعة (Executive Summary).
2. فحص بوابة الجودة والاختبارات الآلية (Quality Gate Status).
3. فحص الأمان، حماية الأسرار، وعزل البيانات (Security & Secret Store).
4. فحص المعمارية وسلامة العمليات (ACID Transactions & Error Handling).
5. تقييم المشروع من 10 (كنموذج أولي وكمنتج جاهز للإنتاج Production-Ready).
6. القرار النهائي الصارم: (VERDICT: APPROVED 100% أو VERDICT: CHANGES REQUIRED).`;

  try {
    // Single-shot streaming pipeline: No ReAct loops, tokens stream in real time to stdout!
    const rawReview = await callSignor([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], {
      enableTools: false, // Deterministic single-shot pipeline for instant speed
      stream: true,        // Live token streaming
      kind: "review",
      projectDir: cwd,
    }, config);

    console.log(`\n\x1b[90m--------------------------------------------------------------------------------\x1b[0m\n`);

    // Deterministic gate enforcement
    let review = rawReview;
    if (!gateResult.passed) {
      if (review.includes("VERDICT: APPROVED")) {
        review = review.replace(/#*\s*VERDICT:\s*APPROVED[^\n]*/gi, "### VERDICT: CHANGES REQUIRED\n> ⚠️ **إلغاء حتمي (Gate Enforcement):** تم حظر الاعتماد آلياً لأن الاختبارات الآلية فشلت.");
      }
    }

    const signorDir = path.join(cwd, ".signor");
    const plansDir = path.join(signorDir, "plans");
    if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archivePath = path.join(plansDir, `review-${timestamp}.md`);
    const reviewPath = path.join(signorDir, "signor_review.md");

    const fullMarkdown = `# تقرير فحص الكود — Signor QA Lead\n\n- **التاريخ:** ${new Date().toLocaleString("ar-EG")}\n- **النموذج:** \`${config.model}\`\n- **بوابة الجودة (Tests):** ${gateResult.passed ? "✅ اجتازت بنجاح" : "❌ فشلت الاختبارات"}\n- **زمن التنفيذ الإجمالي:** ${((Date.now() - overallStart) / 1000).toFixed(1)}s\n\n---\n\n${review}\n`;

    atomicWriteFileSync(archivePath, fullMarkdown);
    atomicWriteFileSync(reviewPath, fullMarkdown);

    try { recordArtifact(null, "review", ".signor/signor_review.md", reviewPath, cwd); } catch {}

    const solDir = path.join(cwd, "sol");
    if (fs.existsSync(solDir)) {
      atomicWriteFileSync(path.join(solDir, "sol_review.md"), fullMarkdown);
    }

    console.log(`⚡ \x1b[32m\x1b[1mCode Review completed successfully in ${((Date.now() - overallStart) / 1000).toFixed(1)}s!\x1b[0m`);
    console.log(`📄 Saved to: .signor/signor_review.md`);
    console.log(`📁 Archive copy: .signor/plans/review-${timestamp}.md\n`);
  } catch (err) {
    console.error("\n❌ Review failed:", err.message);
    process.exit(1);
  }
}

