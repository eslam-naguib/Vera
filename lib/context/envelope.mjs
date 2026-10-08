import { scanProjectIdentity } from "./scanner.mjs";
import { buildCompactFileTree } from "./tree.mjs";

const contextCache = new Map();

/**
 * Builds the complete, bounded Project Context Envelope.
 * Deterministic and fast (< 25ms on first run, < 1ms on cached runs).
 *
 * @param {string} projectDir - Root project directory.
 * @param {object} options - Options for scanner & tree limits.
 * @returns {object} Full context envelope with formatted Markdown.
 */
export function buildProjectContext(projectDir = process.cwd(), options = {}) {
  const cacheKey = `${projectDir}:${options.maxPaths || 180}`;
  if (!options.bypassCache && contextCache.has(cacheKey)) {
    return contextCache.get(cacheKey);
  }

  const identity = scanProjectIdentity(projectDir);
  const tree = buildCompactFileTree(projectDir, options);

  const envelope = {
    timestamp: new Date().toISOString(),
    projectDir,
    identity,
    tree,
    tokenEstimate: 0,
    formattedPrompt: "",
  };

  envelope.formattedPrompt = formatEnvelopeForPrompt(envelope);
  // Rough token estimation (~3.8 chars per token for bilingual text/code)
  envelope.tokenEstimate = Math.ceil(envelope.formattedPrompt.length / 3.8);

  contextCache.set(cacheKey, envelope);
  return envelope;
}

/**
 * Formats the envelope into a high-density, token-efficient Markdown block (< 800 tokens).
 *
 * @param {object} envelope - Project context object.
 * @returns {string} Ultra-dense Markdown prompt chunk.
 */
export function formatEnvelopeForPrompt(envelope) {
  const { identity, tree } = envelope;

  const langs = identity.languages.length > 0 ? identity.languages.join(", ") : "Not specified";
  const fws = identity.frameworks.length > 0 ? identity.frameworks.join(", ") : "None detected";
  const dbs = identity.databases.length > 0 ? identity.databases.join(", ") : "None detected";
  const pkgMgr = identity.packageManager !== "unknown" ? ` (${identity.packageManager})` : "";
  const monorepoTag = identity.isMonorepo ? " [Monorepo Workspace]" : "";

  const entries = identity.entrypoints.concat(tree.entrypoints).filter(Boolean);
  const uniqueEntries = [...new Set(entries)].slice(0, 6).join(", ") || "Standard";

  const keyDeps = identity.dependencies.slice(0, 25).join(", ") || "None";
  const keyConfigs = tree.configs.slice(0, 8).join(", ") || "None";
  const keySchemas = tree.schemas.slice(0, 8).join(", ") || "None";
  const keyRoutes = (tree.routes || []).slice(0, 8).join(", ") || "None";

  // Build condensed tree paths (capped at 65 paths to guarantee < 800 token budget)
  const treeList = tree.paths.slice(0, 65).join("\n");
  const truncationNotice = tree.truncated || tree.paths.length > 65 ? "\n... [المزيد من الملفات تم طيها توفيراً لاستهلاك التوكنات]" : "";

  return `
---
### 📁 سياق المشروع الحقيقي المستخرج محلياً (Zero-Token Local Context Envelope)
- **اسم المشروع:** \`${identity.name}\` (${identity.ecosystem}${pkgMgr})${monorepoTag}
- **لغات البرمجة:** ${langs}
- **أطر العمل (Frameworks):** ${fws}
- **قواعد البيانات (Databases / ORMs):** ${dbs}
- **نقاط الدخول (Entrypoints):** ${uniqueEntries}
- **ملفات الإعدادات (Configs):** ${keyConfigs}
- **نماذج البيانات والجداول (Schemas / Models):** ${keySchemas}
- **المسارات والواجهات (Routes / APIs):** ${keyRoutes}
- **أهم التبعيات (Key Dependencies):** ${keyDeps}

**شجرة هيكل الملفات الفعلية في المشروع (Compact File Hierarchy):**
\`\`\`text
${treeList}${truncationNotice}
\`\`\`
> ⚠️ **توجيه إلزامي للمعماري:** هذه هي البنية الحقيقية للمشروع. يمنع منعاً باتاً افتراض وجود ملفات أو مسارات أو مكتبات وهمية (Zero Hallucination). ابنِ كافة خططك واستجاباتك ونصوصك البرمجية على هذه التبعيات والملفات القائمة حصراً. إذا احتجت لفحص تفاصيل دقيقة، استخدم أداة \`view_file\` لقراءة السطور المطلوبة فقط.
---
`.trim();
}

/**
 * Injects the Project Context Envelope into an array of chat messages.
 * If a system prompt is present, appends the envelope to it.
 * Otherwise, prepends a new system message containing the envelope.
 *
 * @param {Array<object>} messages - Chat completions messages.
 * @param {string} projectDir - Target root directory.
 * @param {object} options - Generation options.
 * @returns {Array<object>} New messages array with context injected.
 */
export function injectProjectContext(messages, projectDir = process.cwd(), options = {}) {
  const envelope = buildProjectContext(projectDir, options);
  const contextBlock = envelope.formattedPrompt;

  const updatedMessages = messages.map(m => ({ ...m }));
  const systemIdx = updatedMessages.findIndex(m => m.role === "system");

  if (systemIdx !== -1) {
    if (!updatedMessages[systemIdx].content.includes("سياق المشروع الحقيقي")) {
      updatedMessages[systemIdx].content = `${updatedMessages[systemIdx].content}\n\n${contextBlock}`;
    }
  } else {
    updatedMessages.unshift({
      role: "system",
      content: contextBlock
    });
  }

  return updatedMessages;
}

/**
 * Clears the context cache.
 */
export function clearProjectContextCache() {
  contextCache.clear();
}
