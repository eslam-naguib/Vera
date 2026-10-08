import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveSafePath } from "./security.mjs";
import { stageFileChange } from "./safety/changeset.mjs";

export { resolveSafePath };

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf",
  ".zip", ".tar", ".gz", ".7z", ".rar", ".exe", ".dll",
  ".bin", ".wasm", ".pyc", ".class", ".db", ".sqlite", ".iso"
]);

function isBinaryBuffer(buf) {
  const checkLen = Math.min(buf.length, 4096);
  for (let i = 0; i < checkLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

export const AGENTIC_TOOLS = [
  {
    type: "function",
    function: {
      name: "view_file",
      description: "Read the contents of a local file in the project with token-capped line slicing and line numbering.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to the file within the project directory." },
          start_line: { type: "integer", description: "Optional starting line number (1-indexed, default: 1)." },
          end_line: { type: "integer", description: "Optional ending line number (1-indexed)." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_code",
      description: "Search for a string pattern across files in the project with token-capped snippets.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query or keyword." },
          subpath: { type: "string", description: "Optional subdirectory to limit search to." },
          file_extension: { type: "string", description: "Optional file extension like .ts, .js, .py, or .php." },
          max_results: { type: "integer", description: "Maximum matching snippets to return (default: 15, max: 30)." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List directory contents including files and subfolders, ignoring build and dependency caches.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to project (default: '.')." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Stage creation of a new file or full overwrite of an existing file in memory. Zero disk impact until user confirms approval.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to the file to create or overwrite." },
          content: { type: "string", description: "Complete content of the file." }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Stage surgical exact-string replacement in an existing file. Zero disk impact until user approves the unified diff.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to the file to edit." },
          target_content: { type: "string", description: "Exact unique substring to replace (must match exactly once)." },
          replacement_content: { type: "string", description: "Replacement content to insert." }
        },
        required: ["path", "target_content", "replacement_content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "replace_content",
      description: "Alias for edit_file: surgical exact-string replacement staged in memory for user review.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to the file to edit." },
          target_content: { type: "string", description: "Exact unique substring to replace." },
          replacement_content: { type: "string", description: "Replacement content to insert." }
        },
        required: ["path", "target_content", "replacement_content"]
      }
    }
  }
];

export async function executeTool(name, args, projectDir = process.cwd()) {
  try {
    switch (name) {
      case "view_file": {
        const fullPath = resolveSafePath(args.path, projectDir);
        if (!fs.existsSync(fullPath)) {
          return JSON.stringify({ error: `File not found: ${args.path}` });
        }
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          return JSON.stringify({ error: `Path is a directory, not a file: ${args.path}` });
        }

        const ext = path.extname(fullPath).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          return JSON.stringify({
            path: args.path,
            error: "Binary file cannot be displayed as text.",
            size_bytes: stat.size
          });
        }

        const rawBuffer = fs.readFileSync(fullPath);
        if (isBinaryBuffer(rawBuffer)) {
          return JSON.stringify({
            path: args.path,
            error: "Binary contents detected; file cannot be displayed as plain text.",
            size_bytes: stat.size
          });
        }

        const content = rawBuffer.toString("utf-8");
        const lines = content.split("\n");
        const start = Math.max(1, args.start_line || 1);
        const maxChunk = 200; // Standard slice size to protect LLM context tokens
        const requestedEnd = args.end_line ? Math.min(lines.length, args.end_line) : Math.min(lines.length, start + maxChunk - 1);
        const end = Math.min(requestedEnd, start + 350); // Hard ceiling 350 lines per query
        
        // Format lines with 1-indexed line numbers and cap individual line width to 300 chars
        const sliced = lines.slice(start - 1, end).map((l, i) => {
          const truncatedLine = l.length > 300 ? l.slice(0, 300) + " ... [line truncated]" : l;
          return `${start + i}: ${truncatedLine}`;
        }).join("\n");

        return JSON.stringify({
          path: args.path,
          total_lines: lines.length,
          start_line: start,
          end_line: end,
          is_truncated: end < lines.length,
          content: sliced
        });
      }

      case "list_directory": {
        const fullPath = resolveSafePath(args.path || ".", projectDir);
        if (!fs.existsSync(fullPath)) {
          return JSON.stringify({ error: `Directory not found: ${args.path}` });
        }
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const ignoredDirs = new Set([
          "node_modules", ".git", ".next", "dist", "vendor", ".signor",
          "build", "out", "coverage", ".cache", ".turbo"
        ]);

        const summary = entries
          .filter(e => !ignoredDirs.has(e.name))
          .map(e => ({
            name: e.name,
            type: e.isDirectory() ? "directory" : "file"
          }));

        return JSON.stringify({
          path: args.path || ".",
          total_entries: summary.length,
          entries: summary.slice(0, 50),
          capped: summary.length > 50
        });
      }

      case "search_code": {
        const targetDir = args.subpath ? resolveSafePath(args.subpath, projectDir) : path.resolve(projectDir);
        if (!fs.existsSync(targetDir)) {
          return JSON.stringify({ error: `Search directory not found: ${args.subpath}` });
        }
        const results = [];
        const maxResults = Math.min(Math.max(1, args.max_results || 15), 30); // Strict token conservation cap

        const ignoredDirs = new Set([
          "node_modules", ".git", ".next", "vendor", "dist", ".signor",
          "build", "out", "coverage", ".cache", ".turbo"
        ]);

        function walk(current) {
          if (results.length >= maxResults) return;
          let entries = [];
          try {
            entries = fs.readdirSync(current, { withFileTypes: true });
          } catch {
            return;
          }
          for (const e of entries) {
            if (results.length >= maxResults) return;
            if (ignoredDirs.has(e.name)) continue;

            const itemPath = path.join(current, e.name);
            if (e.isDirectory()) {
              walk(itemPath);
            } else if (e.isFile()) {
              if (args.file_extension && !e.name.endsWith(args.file_extension)) continue;
              const ext = path.extname(e.name).toLowerCase();
              if (BINARY_EXTENSIONS.has(ext)) continue;

              try {
                const stat = fs.statSync(itemPath);
                if (stat.size > 1024 * 1024) continue; // Skip files > 1MB

                const text = fs.readFileSync(itemPath, "utf-8");
                if (text.includes(args.query)) {
                  const rel = path.relative(projectDir, itemPath).replace(/\\/g, "/");
                  const lines = text.split("\n");
                  for (let idx = 0; idx < lines.length; idx++) {
                    if (results.length >= maxResults) break;
                    const line = lines[idx];
                    if (line.includes(args.query)) {
                      results.push({
                        file: rel,
                        line: idx + 1,
                        snippet: line.trim().slice(0, 120)
                      });
                    }
                  }
                }
              } catch {}
            }
          }
        }

        walk(targetDir);
        return JSON.stringify({
          query: args.query,
          matches: results,
          total_matches: results.length,
          capped: results.length >= maxResults
        });
      }

      case "write_file": {
        const fullPath = resolveSafePath(args.path, projectDir);
        let oldContent = "";
        const isExisting = fs.existsSync(fullPath);
        if (isExisting) {
          oldContent = fs.readFileSync(fullPath, "utf-8");
        }
        const staged = stageFileChange({
          projectDir,
          filePath: args.path,
          operation: isExisting ? "edit" : "create",
          newContent: args.content,
          oldContent
        });
        return JSON.stringify({
          status: "staged_for_approval",
          path: staged.relPath,
          operation: staged.operation,
          bytes: staged.newContent.length,
          sha256: staged.targetSha256,
          message: "الملف تم تجهيزه في الذاكرة (Staged in memory). سيتم عرضه على المستخدم للموافقة الصريحة قبل كتابته على القرص."
        });
      }

      case "edit_file":
      case "replace_content": {
        const fullPath = resolveSafePath(args.path, projectDir);
        if (!fs.existsSync(fullPath)) {
          return JSON.stringify({ error: `File not found: ${args.path}` });
        }
        const oldContent = fs.readFileSync(fullPath, "utf-8");
        if (!oldContent.includes(args.target_content)) {
          return JSON.stringify({
            error: `Target content not found in file: ${args.path}. Ensure exact line text, indentation, and whitespace match.`
          });
        }
        const occurrences = oldContent.split(args.target_content).length - 1;
        if (occurrences > 1) {
          return JSON.stringify({
            error: `Target content matches ${occurrences} locations in ${args.path}. Provide more unique surrounding context lines.`
          });
        }
        const newContent = oldContent.replace(args.target_content, args.replacement_content);
        const staged = stageFileChange({
          projectDir,
          filePath: args.path,
          operation: "edit",
          newContent,
          oldContent
        });
        return JSON.stringify({
          status: "staged_for_approval",
          path: staged.relPath,
          operation: "edit",
          sha256: staged.targetSha256,
          message: "التعديل تم تجهيزه في الذاكرة (Staged in memory). سيتم عرض الـ Unified Diff على المستخدم لاعتماده قبل الحفظ."
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: `Tool execution failed: ${err.message}` });
  }
}
