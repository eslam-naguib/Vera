import { callSignor } from "../engine.mjs";
import { getPendingChangeSet, applyPendingChangeSet } from "../safety/changeset.mjs";

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
        content: `You are Sol, Principal AI Software Architect & Technical Lead. Provide direct, highly technical, actionable guidance in Arabic with deep code expertise.
You have FULL access to the codebase using native tools:
- Inspection: view_file, search_code, list_directory
- Modification: write_file, edit_file / replace_content
When asked to modify, create, or fix code in the project, use write_file or edit_file directly to stage the changes.
Your modifications are staged safely in memory and will be reviewed by the user with a unified diff before applying.`
      },
      { role: "user", content: query }
    ], {
      stream: true,
      enableTools: options.enableTools ?? true,
      projectDir: process.cwd(),
      ...options
    }, config);

    // If modifications were staged in memory during this run, trigger the Safety Approval Gate
    const pending = getPendingChangeSet();
    if (pending.length > 0) {
      await applyPendingChangeSet({
        autoApprove: config.auto_approve || options.autoApprove || false,
        projectDir: process.cwd()
      });
    }

    return reply;
  } catch (err) {
    console.error("\n❌ Request failed:", err.message);
    process.exit(1);
  }
}
