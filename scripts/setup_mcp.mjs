import fs from "node:fs";
import path from "node:path";
import os from "node:os";

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

  const serverBin = path.resolve(process.cwd(), "bin", "vera-mcp.mjs").replace(/\\/g, "/");
  mcpConfig.mcpServers.vera = {
    command: "node",
    args: [serverBin]
  };

  fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2), "utf-8");
  console.log(`\n🎉 MCP Config Updated: ${configPath}`);
  console.log(`   Registered 'vera' server -> ${serverBin}`);
}

import { fileURLToPath } from "node:url";

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  setupMcp();
}
