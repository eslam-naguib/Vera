import {
  loadConfig,
  saveGlobalConfig,
  saveLocalConfig,
  getGlobalConfigFile,
  getLocalConfigFile,
  EFFORT_MAP
} from "../config.mjs";

export async function handleConfig(args, currentConfig) {
  const sub = args[0] || "show";

  if (sub === "show") {
    const globalPath = getGlobalConfigFile();
    const localPath = getLocalConfigFile();
    console.log("\n⚙️  Signor Active Configuration\n");
    console.log(`Global Config: ${globalPath}`);
    console.log(`Local Config:  ${localPath || "(none found in project tree)"}\n`);

    const masked = { ...currentConfig };
    if (masked.api_key) {
      masked.api_key = masked.api_key.slice(0, 7) + "..." + masked.api_key.slice(-4);
    }
    console.table(masked);

    console.log("\nEffort Mapping:");
    for (const [lvl, info] of Object.entries(EFFORT_MAP)) {
      const active = lvl === currentConfig.effort ? " ← ACTIVE" : "";
      console.log(`  ${lvl.padEnd(8)}: temp=${info.temperature}, max_tokens=${info.max_tokens}, timeout=${info.timeout / 1000}s (${info.label})${active}`);
    }
    console.log();
    return;
  }

  if (sub === "get") {
    const key = args[1];
    if (!key) {
      console.error("❌ Usage: signor config get <key>");
      process.exit(1);
    }
    console.log(currentConfig[key] ?? "");
    return;
  }

  if (sub === "set") {
    const key = args[1];
    const val = args[2];
    const isGlobal = args.includes("--global") || args.includes("-g");

    if (!key || val === undefined) {
      console.error("❌ Usage: signor config set <key> <value> [--global]");
      process.exit(1);
    }

    if (key === "effort" && !EFFORT_MAP[val]) {
      console.error(`❌ Invalid effort '${val}'. Choose one of: ${Object.keys(EFFORT_MAP).join(", ")}`);
      process.exit(1);
    }

    const updates = { [key]: val };
    const res = isGlobal ? saveGlobalConfig(updates) : saveLocalConfig(updates);

    if (res.success) {
      console.log(`\n✅ Saved [${key} = ${val}] to ${isGlobal ? "global" : "local"} config:`);
      console.log(`   ${res.path}\n`);
    } else {
      console.error(`\n❌ Failed to save config: ${res.error}\n`);
      process.exit(1);
    }
    return;
  }

  console.log(`
Usage:
  signor config show                    # Display current resolved configuration
  signor config get <key>               # Print specific setting value
  signor config set <key> <val>         # Set in local .signor/config.json
  signor config set <key> <val> -g      # Set in global ~/.signor/config.json
`);
}
