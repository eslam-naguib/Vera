import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const homeDir = os.homedir();
const targets = [
  path.join(homeDir, ".gemini", "antigravity", "mcp", "vera"),
  path.join(homeDir, ".gemini", "antigravity-ide", "mcp", "vera"),
];

const TOOLS = [
  {
    name: "vera_plan",
    description: "توليد خطة معمارية وتنفيذية شاملة ومفصلة للمشروع مبنية على فحص الكود الحقيقي وهيكلية الملفات والتبعيات. Generate a comprehensive architectural master plan grounded in real project code, topology, and dependencies.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "وصف المهمة المعمارية أو البرمجية المراد التخطيط لها بدقة (The architectural or engineering task description)"
        },
        model: {
          type: "string",
          description: "اختياري: معرف نموذج الذكاء الاصطناعي (e.g. gpt-6-astra, claude-fable-5-1, gpt-5.6-sol)"
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "ultra"],
          description: "مستوى التفكير والجهد المعماري (الافتراضي: high)"
        },
        debate: {
          type: "boolean",
          description: "تفعيل المناظرة المعمارية التنافسية متعددة الوكلاء قبل اعتماد الخطة النهائية"
        }
      },
      required: ["task"]
    }
  },
  {
    name: "vera_review",
    description: "تنفيذ مراجعة كود واختبارات جودة صارمة وفحص Git diff والتحقق من عدم وجود Mock Data واختبار التوافق. Run deterministic QA code review pipeline, inspecting Git diffs and test suites.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "نطاق الملف أو المجلد المستهدف بالمراجعة اختياري (Target file or directory scope)"
        },
        model: {
          type: "string",
          description: "اختياري: معرف نموذج الذكاء الاصطناعي"
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "ultra"],
          description: "مستوى جهد التفكير والمراجعة"
        }
      }
    }
  },
  {
    name: "vera_audit",
    description: "فحص معماري وأمني شامل للنظام وهيكلية المشروع واكتشاف الثغرات وتدقيق معاملات قاعدة البيانات. Perform full-spectrum system, topology, schema, and security vulnerability audit.",
    parameters: {
      type: "object",
      properties: {
        model: {
          type: "string",
          description: "اختياري: معرف نموذج الذكاء الاصطناعي"
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "ultra"],
          description: "مستوى جهد التفكير والتدقيق"
        }
      }
    }
  },
  {
    name: "vera_debate",
    description: "إطلاق مناظرة معمارية تنافسية متعددة الوكلاء (Red Hat vs Blue Hat) أو مبارزة بين نموذجين لاختبار القرارات المعمارية. Launch multi-agent dialectical debate or cross-model duel.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "الموضوع أو القرار المعماري المراد التناظر حوله (Architectural topic to debate)"
        },
        agent1: {
          type: "string",
          description: "النموذج أو الوكيل الأول (First agent model or persona)"
        },
        agent2: {
          type: "string",
          description: "النموذج أو الوكيل الثاني (Second agent model or persona)"
        },
        rounds: {
          type: "number",
          description: "عدد جولات المناظرة (الافتراضي: 3)"
        },
        hats: {
          type: "boolean",
          description: "فرض القبعات المعرفية المتضادة (قبعة زرقاء معمارية ضد قبعة حمراء ناقدة)"
        }
      },
      required: ["task"]
    }
  },
  {
    name: "vera_ask",
    description: "استشارة Vera مع إدراك كامل بسياق الكود المحلي والوصول لأدوات القراءة والبحث والتعديل الآمن في الذاكرة. Consult Vera with full codebase awareness and staged modification tools.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "سؤالك أو التوجيه البرمجي المطلوب تنفيذه (Your question or prompt)"
        },
        model: {
          type: "string",
          description: "اختياري: معرف نموذج الذكاء الاصطناعي"
        },
        effort: {
          type: "string",
          enum: ["low", "medium", "high", "ultra"],
          description: "مستوى جهد التفكير"
        },
        auto_approve: {
          type: "boolean",
          description: "الموافقة التلقائية على تطبيق التعديلات على القرص دون تأكيد تفاعلي"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "vera_init",
    description: "مسح فوري لهيكلية المشروع وتوليد مخطط سياق شامل دائم (.vera/project_context.md) بتكلفة صفر توكن. Scan workspace topology and generate persistent project blueprint with zero tokens.",
    parameters: {
      type: "object",
      properties: {
        refresh: {
          type: "boolean",
          description: "إعادة المسح الإجباري وتحديث المخطط المعماري للمشروع"
        }
      }
    }
  },
  {
    name: "vera_apply",
    description: "مراجعة وتطبيق التعديلات البرمجية المعلقة في الذاكرة على القرص بشكل ذري مع فحص التوافقية SHA-256. Review and atomically apply in-memory staged changes to disk.",
    parameters: {
      type: "object",
      properties: {
        yes: {
          type: "boolean",
          description: "تأكيد كتابة وتطبيق التعديلات على القرص (الافتراضي: true)"
        }
      }
    }
  }
];

const INSTRUCTIONS_MD = `# Vera AI — Model Context Protocol (MCP) Guide

Vera AI serves as your Autonomous Principal AI Architect & Code Engineer directly inside Gemini IDE and Antigravity.

## Available Native Tools

1. **\`vera_plan\`**: Generates an exhaustive architectural master plan with zero mock data and strict schema design.
2. **\`vera_review\`**: Runs deterministic quality gates (tests, git delta, quality checks) and returns QA feedback.
3. **\`vera_audit\`**: Performs full-spectrum architectural, dependency, schema, and security vulnerability audits.
4. **\`vera_debate\`**: Pits two AI perspectives against each other (Red Hat vs Blue Hat) to expose design blind spots.
5. **\`vera_ask\`**: Queries Vera with local codebase context and safe memory-staged code modifications.
6. **\`vera_init\`**: Scans repository topology and creates persistent \`.vera/project_context.md\` at zero token cost.
7. **\`vera_apply\`**: Atomically applies staged memory changes to disk with SHA-256 conflict protection.

## Safety & Invariants
- All file edits generated by \`vera_ask\` are staged in memory first. Use \`vera_apply\` to commit changes to disk.
- Zero mock data in production architectures.
- All operations are recorded in SQLite ACID ledger under \`.vera/vera.sqlite\`.
`;

export function setupMcp() {
  console.log("⚡ [Vera MCP Setup] Installing tool schemas into Antigravity IDE directories...");

  for (const dir of targets) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    for (const tool of TOOLS) {
      const filePath = path.join(dir, `${tool.name}.json`);
      fs.writeFileSync(filePath, JSON.stringify(tool, null, 2), "utf-8");
      console.log(`  ✔ Schema registered: ${path.relative(homeDir, filePath)}`);
    }

    const instructionsPath = path.join(dir, "instructions.md");
    fs.writeFileSync(instructionsPath, INSTRUCTIONS_MD, "utf-8");
    console.log(`  ✔ Documentation: ${path.relative(homeDir, instructionsPath)}`);
  }

  // Update ~/.gemini/config/mcp_config.json
  const configPath = path.join(homeDir, ".gemini", "config", "mcp_config.json");
  let mcpConfig = { mcpServers: {} };
  if (fs.existsSync(configPath)) {
    try {
      mcpConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {}
  }
  if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};

  // Resolve 8.3 short path on Windows to prevent OEM code page issues with non-ASCII directory names
  let projectBase = process.cwd();
  if (process.platform === "win32") {
    try {
      const out = execSync(`powershell -NoProfile -Command "(New-Object -ComObject Scripting.FileSystemObject).GetFolder((Get-Location).Path).ShortPath"`, { encoding: "utf-8" }).trim();
      if (out && fs.existsSync(out)) {
        projectBase = out;
      }
    } catch {}
  }

  const serverBin = path.join(projectBase, "bin", "vera-mcp.mjs").replace(/\\/g, "/");
  mcpConfig.mcpServers.vera = {
    command: "node",
    args: [serverBin]
  };

  fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
  console.log(`\n🎉 MCP Config Updated: ${configPath}`);
  console.log(`   Registered 'vera' server -> ${serverBin}`);

  // Global npm wrappers in AppData/Roaming/npm
  const npmGlobalDir = path.join(homeDir, "AppData", "Roaming", "npm");
  if (fs.existsSync(npmGlobalDir)) {
    const veraBin = path.join(projectBase, "bin", "vera.mjs");
    const veraMcpBin = path.join(projectBase, "bin", "vera-mcp.mjs");

    const veraCmdContent = `@ECHO off\r\nnode "${veraBin}" %*\r\n`;
    fs.writeFileSync(path.join(npmGlobalDir, "vera.cmd"), veraCmdContent, "utf-8");

    const veraMcpCmdContent = `@ECHO off\r\nnode "${veraMcpBin}" %*\r\n`;
    fs.writeFileSync(path.join(npmGlobalDir, "vera-mcp.cmd"), veraMcpCmdContent, "utf-8");

    const veraPs1Content = `#!/usr/bin/env pwsh\r\n& node "${veraBin}" @args\r\n`;
    fs.writeFileSync(path.join(npmGlobalDir, "vera.ps1"), veraPs1Content, "utf-8");

    const veraMcpPs1Content = `#!/usr/bin/env pwsh\r\n& node "${veraMcpBin}" @args\r\n`;
    fs.writeFileSync(path.join(npmGlobalDir, "vera-mcp.ps1"), veraMcpPs1Content, "utf-8");

    // Repair npm node_modules/vera junction if present
    const junctionPath = path.join(npmGlobalDir, "node_modules", "vera");
    try {
      if (fs.existsSync(junctionPath)) {
        fs.rmSync(junctionPath, { recursive: true, force: true });
      }
      fs.symlinkSync(projectBase, junctionPath, "junction");
      console.log(`  ✔ Global junction repaired: ${junctionPath} -> ${projectBase}`);
    } catch {}

    console.log(`  ✔ Global CLI wrapper updated: ${path.join(npmGlobalDir, "vera.cmd")}`);
    console.log(`  ✔ Global MCP wrapper created: ${path.join(npmGlobalDir, "vera-mcp.cmd")}`);
  }
}

import { fileURLToPath } from "node:url";

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  setupMcp();
}
