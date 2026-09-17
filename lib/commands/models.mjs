import { KNOWN_MODELS, pingModel } from "../models.mjs";

export async function handleModels(config, options = {}) {
  console.log("\n📡 Signor Model Health Radar\n");
  console.log(`Endpoint: ${config.base_url}`);
  console.log(`Active Model: \x1b[36m${config.model}\x1b[0m | Effort: \x1b[33m${config.effort}\x1b[0m\n`);
  console.log("Checking model health in real-time...\n");

  const results = [];
  for (const m of KNOWN_MODELS) {
    process.stdout.write(`  Testing ${m.id.padEnd(20)} ... `);
    const res = await pingModel(m.id, config);
    results.push({ ...m, ...res });
    if (res.status === "live") {
      console.log(`\x1b[32m● LIVE\x1b[0m (${res.latencyMs}ms)`);
    } else if (res.status === "slow") {
      console.log(`\x1b[33m● SLOW\x1b[0m (${res.latencyMs}ms)`);
    } else if (res.status === "unauthorized") {
      console.log(`\x1b[31m● UNAUTHORIZED\x1b[0m (401/403)`);
    } else if (res.status === "not_found") {
      console.log(`\x1b[90m○ NOT FOUND\x1b[0m (404)`);
    } else {
      console.log(`\x1b[31m✕ DOWN\x1b[0m (${res.error || "error"})`);
    }
  }

  console.log("\n" + "─".repeat(70));
  console.log(`To switch active model:  signor config set model <model-id>`);
  console.log(`To adjust effort:        signor config set effort <low|medium|high|ultra>`);
  console.log("─".repeat(70) + "\n");
}
