import fs from "node:fs";
import path from "node:path";
import { runDebateSession, normalizeModelId } from "../debate/orchestrator.mjs";

export async function handleDebate(args, config) {
  const cwd = process.cwd();
  const rawTokens = Array.isArray(args) ? args : [args];

  // Parse debate-specific flags
  const options = {
    agent1: null,
    agent2: null,
    effort1: null,
    effort2: null,
    hats: false,
    synthesizer: null,
  };

  const textTokens = [];

  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i];
    if ((token === "--agent1" || token === "-a1") && rawTokens[i + 1]) {
      options.agent1 = rawTokens[++i];
    } else if ((token === "--agent2" || token === "-a2") && rawTokens[i + 1]) {
      options.agent2 = rawTokens[++i];
    } else if (token === "--effort1" && rawTokens[i + 1]) {
      options.effort1 = rawTokens[++i];
    } else if (token === "--effort2" && rawTokens[i + 1]) {
      options.effort2 = rawTokens[++i];
    } else if (token === "--hats") {
      options.hats = true;
    } else if ((token === "--synthesizer" || token === "--synth") && rawTokens[i + 1]) {
      options.synthesizer = rawTokens[++i];
    } else {
      textTokens.push(token);
    }
  }

  let task = textTokens.join(" ").trim();

  // If no task provided inline, check for plan_input.txt
  if (!task) {
    const candidate1 = path.join(cwd, ".signor", "plan_input.txt");
    const candidate2 = path.join(cwd, "sol", "plan_input.txt");
    if (fs.existsSync(candidate1)) {
      task = fs.readFileSync(candidate1, "utf-8").trim();
    } else if (fs.existsSync(candidate2)) {
      task = fs.readFileSync(candidate2, "utf-8").trim();
    }
  }

  if (!task) {
    console.log(`
\x1b[1m\x1b[36m⚡ Signor AI Multi-Agent Debate Engine\x1b[0m

\x1b[33mUsage:\x1b[0m
  signor debate "<task>" [options]

\x1b[33mModes & Options:\x1b[0m
  --agent1 <model>         Model for Proposer / Agent 1 (e.g. astra, fable, sol)
  --agent2 <model>         Model for Challenger / Agent 2 (e.g. astra, fable)
  --effort1 <level>        Effort for Agent 1 (low | medium | high | ultra)
  --effort2 <level>        Effort for Agent 2 (low | medium | high | ultra)
  --hats                   Enable Red vs Blue Hat mode (same model opposing personas)
  --synthesizer <model>    Model to arbitrate and write final synthesis

\x1b[33mExamples:\x1b[0m
  # 1. Homogeneous Red vs Blue Hat debate with Astra 6:
  signor debate "Build Real Estate Landing Page" --agent1 astra --agent2 astra --hats --effort1 medium --effort2 medium

  # 2. Heterogeneous Multi-Model debate between Astra 6 and Fable 5.1:
  signor debate "Build Real Estate Landing Page" --agent1 astra --agent2 fable --effort1 medium --effort2 medium
`);
    process.exit(1);
  }

  return await runDebateSession(task, options, config);
}
