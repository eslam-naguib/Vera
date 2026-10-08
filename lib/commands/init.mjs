import fs from "node:fs";
import path from "node:path";
import { saveLocalConfig } from "../config.mjs";
import { BRAND, resolveConfigDir } from "../brand.mjs";
import { generateProjectBlueprint, scanProjectIdentity } from "../context/index.mjs";
import { atomicWriteFileSync } from "../atomic.mjs";
import { initDatabase, recordArtifact } from "../db.mjs";

/**
 * Initializes Vera in the target directory:
 * 1. Runs deterministic zero-token local scanner.
 * 2. Generates comprehensive Architectural Project Blueprint (.vera/project_context.md).
 * 3. Initializes embedded SQLite ACID transaction ledger.
 * 4. Saves project configuration and prints industrial telemetry summary.
 */
export async function handleInit(args = [], currentConfig = {}) {
  const targetDir = process.cwd();
  const projectName = path.basename(targetDir);
  const isRefresh = Array.isArray(args) && args.some(a => a === "--refresh" || a === "-r");

  console.log(`\n\x1b[1m\x1b[38;2;13;148;136m⚡ [${BRAND.name} Smart Context Engine]\x1b[0m ${isRefresh ? "Refreshing" : "Initializing"} project workspace...`);
  console.log(`   Path: \x1b[90m${targetDir}\x1b[0m\n`);

  // Step 1: Ensure workspace config directory exists
  const configDir = resolveConfigDir(targetDir, true);

  // Step 2: Scan project and generate Architectural Project Blueprint
  process.stdout.write(`  [1/4] 🌐 Scanning project topology & dependencies... `);
  const startScan = Date.now();
  const identity = scanProjectIdentity(targetDir);
  const blueprint = generateProjectBlueprint(targetDir);
  const scanDuration = Date.now() - startScan;
  console.log(`\x1b[32mDone in ${scanDuration}ms\x1b[0m`);

  // Step 3: Write persistent Single Source of Truth blueprint
  process.stdout.write(`  [2/4] 📄 Generating Architectural Blueprint (project_context.md)... `);
  const blueprintPath = path.join(configDir, "project_context.md");
  atomicWriteFileSync(blueprintPath, blueprint);
  const relBlueprintPath = path.relative(targetDir, blueprintPath);
  console.log(`\x1b[32mSaved\x1b[0m`);

  // Step 4: Initialize embedded SQLite ACID ledger
  process.stdout.write(`  [3/4] 🏛️ Initializing SQLite transaction ledger (WAL mode)... `);
  try {
    initDatabase(targetDir);
    recordArtifact(null, "blueprint", relBlueprintPath, blueprintPath, targetDir);
    console.log(`\x1b[32mReady\x1b[0m`);
  } catch (err) {
    console.log(`\x1b[33mWarning (${err.message})\x1b[0m`);
  }

  // Step 5: Save project configuration
  process.stdout.write(`  [4/4] ⚙️  Configuring project defaults... `);
  const initialConfig = {
    project_name: projectName,
    base_url: currentConfig.base_url,
    model: currentConfig.model,
    effort: currentConfig.effort,
    cockpit_port: currentConfig.cockpit_port,
  };

  const res = saveLocalConfig(initialConfig, targetDir);
  if (res.success) {
    console.log(`\x1b[32mDone\x1b[0m`);
  } else {
    console.log(`\x1b[33mPreserved existing\x1b[0m`);
  }

  // Create template plan_input.txt if missing
  const inputPath = path.join(configDir, "plan_input.txt");
  if (!fs.existsSync(inputPath)) {
    fs.writeFileSync(
      inputPath,
      `# اكتب هنا متطلبات المهمة أو التكليف المعماري للمشروع ليتم تنفيذه عبر ${BRAND.name}\n`,
      "utf-8"
    );
  }

  // Summary Card
  const langs = identity.languages.join(", ") || "Unknown";
  const fws = identity.frameworks.join(", ") || "None";
  const dbs = identity.databases.join(", ") || "None";
  const pkgMgr = identity.packageManager !== "unknown" ? identity.packageManager : "default";

  console.log(`\n\x1b[1m\x1b[38;2;13;148;136m================================================================================\x1b[0m`);
  console.log(`\x1b[1m  ✅ ${BRAND.name} Workspace Ready — Project Brain Initialized!\x1b[0m`);
  console.log(`\x1b[1m\x1b[38;2;13;148;136m================================================================================\x1b[0m`);
  console.log(`  • \x1b[1mProject:\x1b[0m      ${identity.name} (${identity.ecosystem} via ${pkgMgr})`);
  console.log(`  • \x1b[1mLanguages:\x1b[0m    ${langs}`);
  console.log(`  • \x1b[1mFrameworks:\x1b[0m   ${fws}`);
  console.log(`  • \x1b[1mDatabases:\x1b[0m    ${dbs}`);
  console.log(`  • \x1b[1mBlueprint:\x1b[0m    \x1b[38;2;245;158;11m${relBlueprintPath}\x1b[0m (Permanent Source of Truth)`);
  console.log(`  • \x1b[1mDirectives:\x1b[0m   Edit Section 5 in \x1b[38;2;245;158;11m${relBlueprintPath}\x1b[0m to add custom rules`);
  console.log(`\n\x1b[1mQuick Actions:\x1b[0m`);
  console.log(`  1. \x1b[36m${BRAND.bin} plan "<task>"\x1b[0m      Formulate master plan grounded in real code`);
  console.log(`  2. \x1b[36m${BRAND.bin} ask "<query>"\x1b[0m       Consult Vera with full codebase awareness`);
  console.log(`  3. \x1b[36m${BRAND.bin} review\x1b[0m              Run deterministic quality gates & QA review`);
  console.log(`  4. \x1b[36m${BRAND.bin} audit\x1b[0m               Run full-spectrum security & architecture audit`);
  console.log(`  5. \x1b[36m${BRAND.bin} cockpit\x1b[0m             Launch telemetry dashboard on http://localhost:5050\n`);
}
