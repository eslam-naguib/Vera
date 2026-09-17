import fs from "node:fs";
import path from "node:path";
import { saveLocalConfig } from "../config.mjs";

export async function handleInit(args, currentConfig) {
  const targetDir = process.cwd();
  const projectName = path.basename(targetDir);

  console.log(`\n🚀 Initializing Signor in: ${targetDir}`);

  const initialConfig = {
    project_name: projectName,
    base_url: currentConfig.base_url,
    model: currentConfig.model,
    effort: currentConfig.effort,
    cockpit_port: currentConfig.cockpit_port,
  };

  const res = saveLocalConfig(initialConfig, targetDir);
  if (res.success) {
    console.log(`✅ Created project configuration:`);
    console.log(`   ${res.path}`);

    // Also create a sample README or plan_input.txt if missing
    const inputPath = path.join(targetDir, ".signor", "plan_input.txt");
    if (!fs.existsSync(inputPath)) {
      fs.writeFileSync(inputPath, `# اكتب هنا متطلبات المهمة أو الخطة المعمارية للمشروع\n`, "utf-8");
    }

    console.log(`\nProject initialized! Next steps:`);
    console.log(`  1. Test connection:  signor ping`);
    console.log(`  2. Check models:     signor models`);
    console.log(`  3. Launch Cockpit:   signor cockpit\n`);
  } else {
    console.error(`❌ Initialization failed: ${res.error}\n`);
    process.exit(1);
  }
}
