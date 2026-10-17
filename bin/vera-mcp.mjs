#!/usr/bin/env node
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../lib/config.mjs";
import { BRAND } from "../lib/brand.mjs";
import { handlePlan } from "../lib/commands/plan.mjs";
import { handleReview } from "../lib/commands/review.mjs";
import { handleAudit } from "../lib/commands/audit.mjs";
import { handleDebate } from "../lib/commands/debate.mjs";
import { handleAsk } from "../lib/commands/ask.mjs";
import { handleInit } from "../lib/commands/init.mjs";
import { getPendingChangeSet, applyPendingChangeSet } from "../lib/safety/changeset.mjs";
import { normalizeModelId } from "../lib/debate/orchestrator.mjs";

/**
 * ⚠️ STRICT MCP REQUIREMENT:
 * Standard output (stdout) is EXCLUSIVELY reserved for JSON-RPC 2.0 messages.
 * Never invoke console.log() or process.stdout.write() directly outside sendJsonRpc.
 * All diagnostic or debug logging MUST use console.error().
 */
const rawStdoutWrite = process.stdout.write.bind(process.stdout);

function sendJsonRpc(obj) {
  rawStdoutWrite(JSON.stringify(obj) + "\n");
}

function stripAnsi(str) {
  if (typeof str !== "string") return "";
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

/**
 * Safe execution sandbox: Captures stdout/console and shields process from process.exit().
 */
async function captureExecution(fn) {
  let capturedText = "";
  const originalStdoutWrite = process.stdout.write;
  const originalConsoleLog = console.log;
  const originalConsoleInfo = console.info;
  const originalConsoleWarn = console.warn;
  const originalExit = process.exit;

  const append = (str) => {
    capturedText += str;
  };

  process.stdout.write = (chunk, encoding, callback) => {
    if (typeof chunk === "string") {
      append(chunk);
    } else if (Buffer.isBuffer(chunk)) {
      append(chunk.toString(encoding || "utf8"));
    }
    if (typeof callback === "function") callback();
    return true;
  };

  console.log = (...args) => {
    append(args.map(a => typeof a === "string" ? a : JSON.stringify(a, null, 2)).join(" ") + "\n");
  };
  console.info = console.log;
  console.warn = console.log;

  process.exit = (code) => {
    if (code && code !== 0) {
      throw new Error(`Command exited with status code ${code}`);
    }
  };

  try {
    const result = await fn();
    return {
      output: stripAnsi(capturedText).trim(),
      result
    };
  } finally {
    process.stdout.write = originalStdoutWrite;
    console.log = originalConsoleLog;
    console.info = originalConsoleInfo;
    console.warn = originalConsoleWarn;
    process.exit = originalExit;
  }
}

/**
 * Tool Catalog & Schema Definitions
 */
export const VERA_TOOLS = [
  {
    name: "vera_plan",
    description: "Generate a comprehensive architectural master plan grounded in real project code, topology, and dependencies.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The architectural or feature engineering task description to plan."
        },
        model: {
          type: "string",
          description: "Optional AI Model ID override (e.g. gpt-6-astra, claude-fable-5-1, gpt-5.6-sol)."
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "ultra"],
          description: "Reasoning effort level (default: high)."
        },
        debate: {
          type: "boolean",
          description: "Whether to engage multi-agent adversarial debate for this plan."
        }
      },
      required: ["task"]
    }
  },
  {
    name: "vera_review",
    description: "Run deterministic QA code review pipeline, inspecting Git diffs against architectural plans and running automated tests.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional target file or directory scope for code review."
        },
        model: {
          type: "string",
          description: "Optional AI Model ID override."
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "ultra"],
          description: "Reasoning effort level."
        }
      }
    }
  },
  {
    name: "vera_audit",
    description: "Perform full-spectrum system, topology, schema, and security vulnerability audit with live streaming report.",
    inputSchema: {
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "Optional AI Model ID override."
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "ultra"],
          description: "Reasoning effort level."
        }
      }
    }
  },
  {
    name: "vera_debate",
    description: "Launch multi-agent dialectical debate (Blue Hat Architect vs Red Hat Adversary) or cross-model duel to battle-test technical decisions.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The architectural topic or decision to debate."
        },
        agent1: {
          type: "string",
          description: "First agent model or persona (e.g. gpt-6-astra)."
        },
        agent2: {
          type: "string",
          description: "Second agent model or persona (e.g. claude-fable-5-1)."
        },
        rounds: {
          type: "number",
          description: "Number of debate rounds (default: 3)."
        },
        hats: {
          type: "boolean",
          description: "Whether to enforce strict opposing Red Hat / Blue Hat cognitive personas."
        }
      },
      required: ["task"]
    }
  },
  {
    name: "vera_ask",
    description: "Consult Vera AI with deep codebase context and full access to agentic code reading, searching, and staged modification tools.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Your question or engineering instruction."
        },
        model: {
          type: "string",
          description: "Optional AI Model ID override."
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "ultra"],
          description: "Reasoning effort level."
        },
        auto_approve: {
          type: "boolean",
          description: "Whether to automatically approve and apply staged code changes."
        }
      },
      required: ["query"]
    }
  },
  {
    name: "vera_init",
    description: "Scan workspace topology and generate persistent single-source-of-truth project blueprint (.vera/project_context.md) with zero token cost.",
    inputSchema: {
      type: "object",
      properties: {
        refresh: {
          type: "boolean",
          description: "Force re-scan and overwrite existing project blueprint."
        }
      }
    }
  },
  {
    name: "vera_apply",
    description: "Review and atomically apply in-memory staged file changes to disk with SHA-256 integrity verification.",
    inputSchema: {
      type: "object",
      properties: {
        yes: {
          type: "boolean",
          description: "Confirm and apply staged changes to disk (default: true)."
        }
      }
    }
  }
];

/**
 * Executes a tool by name and arguments.
 */
export async function executeVeraTool(name, args = {}) {
  const overrides = {};
  if (args.model) overrides.model = normalizeModelId(args.model);
  if (args.effort) overrides.effort = args.effort;

  const config = loadConfig(overrides, process.cwd());

  switch (name) {
    case "vera_plan": {
      if (!args.task || typeof args.task !== "string") {
        throw new Error("Missing required argument: 'task'");
      }
      const taskArgs = args.debate ? [args.task, "--debate"] : [args.task];
      const { output, result } = await captureExecution(async () => {
        return await handlePlan(taskArgs, config);
      });
      return output || (typeof result === "string" ? result : "✅ الخطة المعمارية اكتملت بنجاح.");
    }

    case "vera_review": {
      const reviewArgs = args.path ? [args.path] : [];
      const { output, result } = await captureExecution(async () => {
        return await handleReview(reviewArgs, config);
      });
      return output || (typeof result === "string" ? result : "✅ مراجعة الكود واختبارات الجودة اكتملت.");
    }

    case "vera_audit": {
      const { output, result } = await captureExecution(async () => {
        return await handleAudit([], config);
      });
      return output || (typeof result === "string" ? result : "✅ فحص النظام والأمان اكتمل بنجاح.");
    }

    case "vera_debate": {
      if (!args.task || typeof args.task !== "string") {
        throw new Error("Missing required argument: 'task'");
      }
      const debateArgs = [args.task];
      if (args.agent1) debateArgs.push("--agent1", args.agent1);
      if (args.agent2) debateArgs.push("--agent2", args.agent2);
      if (args.rounds) debateArgs.push("--rounds", String(args.rounds));
      if (args.hats) debateArgs.push("--hats");

      const { output, result } = await captureExecution(async () => {
        return await handleDebate(debateArgs, config);
      });
      return output || (typeof result === "string" ? result : "✅ جلسة المناظرة المعمارية اكتملت.");
    }

    case "vera_ask": {
      if (!args.query || typeof args.query !== "string") {
        throw new Error("Missing required argument: 'query'");
      }
      const autoApprove = args.auto_approve ?? false;
      const { output, result } = await captureExecution(async () => {
        return await handleAsk(args.query, config, { autoApprove });
      });
      return output || (typeof result === "string" ? result : "✅ تمت الإجابة وتعديل الكود.");
    }

    case "vera_init": {
      const initArgs = args.refresh ? ["--refresh"] : [];
      const { output, result } = await captureExecution(async () => {
        return await handleInit(initArgs, config);
      });
      return output || (typeof result === "string" ? result : "✅ تم مسح وهيكلة سياق المشروع بنجاح.");
    }

    case "vera_apply": {
      const pending = getPendingChangeSet();
      if (pending.length === 0) {
        return "ℹ️ لا توجد تعديلات معلقة في الذاكرة لتطبيقها على القرص. (No pending staged changes)";
      }
      const autoApprove = args.yes !== false;
      const { output, result } = await captureExecution(async () => {
        return await applyPendingChangeSet({ autoApprove, projectDir: process.cwd() });
      });
      return output || `✅ تم تطبيق ${pending.length} ملفات على القرص بنجاح.`;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/**
 * Handle incoming JSON-RPC 2.0 requests
 */
async function handleRequest(request) {
  const { id, method, params } = request;

  if (method === "initialize") {
    console.error(`[Vera MCP] Initializing server v${BRAND.version}...`);
    sendJsonRpc({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "vera",
          version: BRAND.version || "2.2.0"
        }
      }
    });
    return;
  }

  if (method === "notifications/initialized") {
    console.error("[Vera MCP] Client successfully connected and initialized.");
    return;
  }

  if (method === "ping") {
    sendJsonRpc({
      jsonrpc: "2.0",
      id,
      result: {}
    });
    return;
  }

  if (method === "tools/list") {
    console.error(`[Vera MCP] Listing ${VERA_TOOLS.length} native tools.`);
    sendJsonRpc({
      jsonrpc: "2.0",
      id,
      result: {
        tools: VERA_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema
        }))
      }
    });
    return;
  }

  if (method === "tools/call") {
    const { name, arguments: toolArgs } = params || {};
    console.error(`[Vera MCP] Tool called: ${name}`);

    try {
      const responseText = await executeVeraTool(name, toolArgs || {});
      sendJsonRpc({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: responseText
            }
          ],
          isError: false
        }
      });
    } catch (err) {
      console.error(`[Vera MCP] Tool error (${name}):`, err.message);
      sendJsonRpc({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `❌ [Vera Error]: ${err.message}`
            }
          ],
          isError: true
        }
      });
    }
    return;
  }

  // Fallback for unknown methods
  if (id !== undefined) {
    sendJsonRpc({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      }
    });
  }
}

/**
 * Main stdio event loop
 */
function startServer() {
  console.error(`🚀 [Vera MCP Server v${BRAND.version}] Running over stdio...`);
  console.error(`📁 Project Directory: ${process.cwd()}`);
  console.error(`🔧 Tools: ${VERA_TOOLS.map(t => t.name).join(", ")}`);

  const rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const request = JSON.parse(trimmed);
      await handleRequest(request);
    } catch (err) {
      console.error("[Vera MCP] JSON parse error:", err.message);
      sendJsonRpc({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`
        }
      });
    }
  });

  rl.on("close", () => {
    console.error("[Vera MCP] Stdio connection closed. Exiting.");
    process.exit(0);
  });
}

// Only start stdio loop if this script is executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startServer();
}
