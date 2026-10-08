#!/usr/bin/env node
import { loadConfig } from "../lib/config.mjs";
import { BRAND } from "../lib/brand.mjs";
import { handlePing } from "../lib/commands/ping.mjs";
import { handleModels } from "../lib/commands/models.mjs";
import { handleConfig } from "../lib/commands/config.mjs";
import { handleInit } from "../lib/commands/init.mjs";
import { handlePlan } from "../lib/commands/plan.mjs";
import { handleAsk } from "../lib/commands/ask.mjs";
import { handleDebate } from "../lib/commands/debate.mjs";
import { handleReview } from "../lib/commands/review.mjs";
import { handleAudit } from "../lib/commands/audit.mjs";
import { handleCockpit } from "../lib/commands/cockpit.mjs";
import { handleInstallSkill } from "../lib/commands/install_skill.mjs";
import { normalizeModelId } from "../lib/debate/orchestrator.mjs";
import { SignorError } from "../lib/errors.mjs";

const rawArgs = process.argv.slice(2);

// Parse CLI flags
const cliOverrides = {};
const filteredArgs = [];

// Extract any bundled flags (e.g. if quotes caused shell to merge flags into the task string)
const cleanTokens = [];
for (const arg of rawArgs) {
  const flagMatch = arg.match(/(.*?)\s+(--(?:model|effort|base-url|api-key)\s+[^\s]+.*)/);
  if (flagMatch) {
    if (flagMatch[1]) cleanTokens.push(flagMatch[1]);
    const remainder = flagMatch[2].split(/\s+/);
    cleanTokens.push(...remainder);
  } else {
    cleanTokens.push(arg);
  }
}

for (let i = 0; i < cleanTokens.length; i++) {
  let arg = cleanTokens[i].replace(/^\\?["']+|\\?["']+$/g, "").trim();
  if (arg === "--model" && cleanTokens[i + 1]) {
    cliOverrides.model = normalizeModelId(cleanTokens[++i].replace(/^\\?["']+|\\?["']+$/g, "").trim());
  } else if (arg === "--effort" && cleanTokens[i + 1]) {
    cliOverrides.effort = cleanTokens[++i].replace(/^\\?["']+|\\?["']+$/g, "").trim();
  } else if (arg === "--base-url" && cleanTokens[i + 1]) {
    cliOverrides.base_url = cleanTokens[++i].replace(/^\\?["']+|\\?["']+$/g, "").trim();
  } else if (arg === "--api-key" && cleanTokens[i + 1]) {
    cliOverrides.api_key = cleanTokens[++i].replace(/^\\?["']+|\\?["']+$/g, "").trim();
  } else if (arg === "--apply" || arg === "--yes" || arg === "-y") {
    cliOverrides.auto_approve = true;
  } else if (arg) {
    filteredArgs.push(arg);
  }
}

const command = filteredArgs[0] || "--help";
const commandArgs = filteredArgs.slice(1);

// Load resolved configuration (flags > local > global > legacy)
const config = loadConfig(cliOverrides, process.cwd());

async function run() {
  switch (command) {
    case "ping":
      await handlePing(config);
      break;

    case "models":
      await handleModels(config, commandArgs);
      break;

    case "config":
      await handleConfig(commandArgs, config);
      break;

    case "init":
      await handleInit(commandArgs, config);
      break;

    case "ask":
    case "chat":
      await handleAsk(commandArgs.join(" "), config);
      break;

    case "plan":
      await handlePlan(commandArgs, config);
      break;

    case "debate":
    case "duel":
      await handleDebate(commandArgs, config);
      break;

    case "review":
      await handleReview(commandArgs, config);
      break;

    case "audit":
      await handleAudit(commandArgs, config);
      break;

    case "cockpit":
      await handleCockpit(commandArgs, config);
      break;

    case "apply": {
      const { applyPendingChangeSet } = await import("../lib/safety/changeset.mjs");
      await applyPendingChangeSet({ autoApprove: cliOverrides.auto_approve || false, projectDir: process.cwd() });
      break;
    }

    case "install-skill":
    case "skill":
      await handleInstallSkill(commandArgs);
      break;

    case "-v":
    case "--version":
      console.log(`${BRAND.name} CLI v${BRAND.version} (Autonomous AI Principal Architect)`);
      break;

    case "-h":
    case "--help":
    default:
      console.log(`
⚡ \x1b[1m\x1b[35m${BRAND.name} — ${BRAND.tagline}\x1b[0m

\x1b[36mUsage:\x1b[0m
  ${BRAND.bin} <command> [options]

\x1b[36mCommands:\x1b[0m
  \x1b[32mping\x1b[0m                     Test connectivity to active model & base URL
  \x1b[32mmodels\x1b[0m                   Display model registry & real-time health radar
  \x1b[32mcockpit [start|status]\x1b[0m   Launch Developer Cockpit Web UI on http://localhost:5050
  \x1b[32mask "<query>"\x1b[0m            Ask Vera with full codebase awareness & agentic code modification
  \x1b[32mapply\x1b[0m                    Review & atomically apply in-memory staged changes to project files
  \x1b[32mplan "<task>"\x1b[0m            Generate comprehensive architectural master plan grounded in real code
  \x1b[32mdebate "<task>"\x1b[0m          Multi-Agent adversarial debate (Red vs Blue Hat or Multi-Model)
  \x1b[32mreview\x1b[0m                   Conduct QA code inspection against tests & quality gates
  \x1b[32maudit\x1b[0m                    Perform full-spectrum system & security audit
  \x1b[32minstall-skill\x1b[0m            Install Antigravity Skill & slash commands (/plan, /debate, /review...)
  \x1b[32mconfig show\x1b[0m              Display active configuration & effort mapping
  \x1b[32mconfig set <key> <val>\x1b[0m   Set setting in project config (.vera/config.json)
  \x1b[32minit\x1b[0m                     Initialize Vera configuration in current directory

\x1b[36mOptions / Overrides:\x1b[0m
  --model <model-id>       Override model for this execution (e.g. gpt-6-astra, claude-fable-5-1, gpt-5.6-sol)
  --effort <level>         Override effort (low | medium | high | ultra)
  --base-url <url>         Override API Base URL for this execution
  --apply, --yes, -y       Auto-approve pending staged changes without interactive prompt
  --daemon, -d             Run cockpit in persistent background mode
  --help, -h               Show this help message
  --version, -v            Show version

\x1b[33mActive Configuration:\x1b[0m
  Model:    \x1b[36m${config.model}\x1b[0m
  Effort:   \x1b[33m${config.effort}\x1b[0m
  Endpoint: ${config.base_url}
`);
  }
}

run().catch((err) => {
  if (err instanceof SignorError) {
    console.error(`\n❌ [${err.code}] ${err.message}`);
  } else {
    console.error("\n❌ Fatal error:", err.message);
  }
  process.exit(1);
});
