import { callSignor } from "../engine.mjs";

export async function handleAsk(args, config, options = {}) {
  const query = Array.isArray(args) ? args.join(" ") : args;
  if (!query || query.trim() === "") {
    console.error("\n❌ Usage: signor ask \"<your prompt or question>\"\n");
    process.exit(1);
  }

  console.log("\n💬 [Sol / Signor AI] Consulting " + config.model + "...");
  console.log("   Effort: " + config.effort);
  console.log("   Prompt: \"" + query.slice(0, 80) + (query.length > 80 ? "..." : "") + "\"\n");

  try {
    const reply = await callSignor([
      {
        role: "system",
        content: "You are Sol, Principal AI Software Architect & Technical Lead. Provide direct, highly technical, actionable guidance in Arabic with deep code expertise."
      },
      { role: "user", content: query }
    ], {
      stream: true,
      enableTools: options.enableTools ?? true,
      projectDir: process.cwd(),
      ...options
    }, config);

    return reply;
  } catch (err) {
    console.error("\n❌ Request failed:", err.message);
    process.exit(1);
  }
}
