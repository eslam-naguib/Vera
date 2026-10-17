import test from "node:test";
import assert from "node:assert";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VERA_TOOLS, executeVeraTool } from "../bin/vera-mcp.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mcpBinary = path.join(__dirname, "..", "bin", "vera-mcp.mjs");

test("mcp: VERA_TOOLS catalog contains all 7 primary tools", () => {
  const toolNames = VERA_TOOLS.map(t => t.name);
  assert.ok(toolNames.includes("vera_plan"));
  assert.ok(toolNames.includes("vera_review"));
  assert.ok(toolNames.includes("vera_audit"));
  assert.ok(toolNames.includes("vera_debate"));
  assert.ok(toolNames.includes("vera_ask"));
  assert.ok(toolNames.includes("vera_init"));
  assert.ok(toolNames.includes("vera_apply"));

  for (const tool of VERA_TOOLS) {
    assert.ok(tool.name.startsWith("vera_"));
    assert.ok(typeof tool.description === "string" && tool.description.length > 10);
    assert.strictEqual(tool.inputSchema.type, "object");
    assert.ok(tool.inputSchema.properties);
  }
});

test("mcp: executeVeraTool executes vera_init safely and returns output", async () => {
  const result = await executeVeraTool("vera_init", { refresh: true });
  assert.ok(typeof result === "string");
  assert.ok(result.includes("Smart Context Engine") || result.includes("Scanning") || result.includes("project_context.md"));
});

test("mcp: executeVeraTool handles vera_apply with empty queue gracefully", async () => {
  const result = await executeVeraTool("vera_apply", { yes: false });
  assert.ok(typeof result === "string");
  assert.ok(result.includes("لا توجد تعديلات") || result.includes("No pending"));
});

test("mcp: executeVeraTool throws on unknown tool", async () => {
  await assert.rejects(
    async () => {
      await executeVeraTool("non_existent_tool", {});
    },
    /Unknown tool: non_existent_tool/
  );
});

test("mcp: stdio JSON-RPC 2.0 protocol roundtrip", async () => {
  const proc = spawn(process.execPath, [mcpBinary], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const responses = [];

  proc.stdout.setEncoding("utf-8");
  let buffer = "";
  proc.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.trim()) {
        try {
          responses.push(JSON.parse(line.trim()));
        } catch {}
      }
    }
  });

  // 1. Send initialize
  proc.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-runner", version: "1.0.0" }
    }
  }) + "\n");

  // 2. Send tools/list
  proc.stdin.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  }) + "\n");

  // Wait for both responses
  await new Promise((resolve) => {
    const check = () => {
      if (responses.length >= 2) return resolve();
      setTimeout(check, 50);
    };
    check();
  });

  proc.stdin.end();
  proc.kill();

  const initRes = responses.find(r => r.id === 1);
  assert.ok(initRes, "Expected initialize response");
  assert.strictEqual(initRes.result.serverInfo.name, "vera");

  const listRes = responses.find(r => r.id === 2);
  assert.ok(listRes, "Expected tools/list response");
  assert.strictEqual(listRes.result.tools.length, 7);
  const registeredNames = listRes.result.tools.map(t => t.name);
  assert.ok(registeredNames.includes("vera_plan"));
  assert.ok(registeredNames.includes("vera_apply"));
});
