import { callSignor } from "../engine.mjs";

export async function handlePing(config) {
  console.log(`\n📡 Pinging Signor AI...`);
  console.log(`   Model:    ${config.model}`);
  console.log(`   Endpoint: ${config.base_url}`);
  console.log(`   Effort:   ${config.effort}`);

  const start = Date.now();
  try {
    process.stdout.write("💬 Signor: ");
    const reply = await callSignor([
      { role: "system", content: "You are Signor, Lead Software Architect & Technical Lead." },
      { role: "user", content: "Ping! Please reply with a single concise sentence in Arabic confirming your identity, active model, and readiness." }
    ], { max_tokens: 150, temperature: 0.2 }, config);

    console.log(`\n\n✅ Connection verified in ${Date.now() - start}ms!`);
  } catch (err) {
    console.error("\n❌ Ping failed:", err.message);
    process.exit(1);
  }
}
