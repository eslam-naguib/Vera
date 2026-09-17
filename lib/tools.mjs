import fs from "node:fs";
import path from "node:path";
import { resolveSafePath } from "./security.mjs";

export { resolveSafePath };

export const AGENTIC_TOOLS = [
  {
    type: "function",
    function: {
      name: "view_file",
      description: "Read the contents of a local file in the project with optional start and end line ranges.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path to the file within the project directory only." },
          start_line: { type: "integer", description: "Optional starting line number (1-indexed)." },
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
      description: "Search for a string pattern across files in the codebase.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query or keyword." },
          subpath: { type: "string", description: "Optional subdirectory to limit search to." },
          file_extension: { type: "string", description: "Optional file extension like .ts or .php." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List directory contents including files and subfolders.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to project." }
        },
        required: ["path"]
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
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const start = Math.max(1, args.start_line || 1);
        const maxChunk = 250;
        const requestedEnd = args.end_line ? Math.min(lines.length, args.end_line) : Math.min(lines.length, start + maxChunk - 1);
        const end = Math.min(requestedEnd, start + 500); // hard cap 500 lines per tool call
        const sliced = lines.slice(start - 1, end).map((l, i) => `${start + i}: ${l}`).join("\n");
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
        const summary = entries.map(e => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file"
        }));
        return JSON.stringify({ path: args.path || ".", entries: summary });
      }

      case "search_code": {
        const targetDir = args.subpath ? resolveSafePath(args.subpath, projectDir) : path.resolve(projectDir);
        if (!fs.existsSync(targetDir)) {
          return JSON.stringify({ error: `Search directory not found: ${args.subpath}` });
        }
        const results = [];
        const maxResults = 25;

        function walk(current) {
          if (results.length >= maxResults) return;
          const entries = fs.readdirSync(current, { withFileTypes: true });
          for (const e of entries) {
            if (results.length >= maxResults) return;
            if (e.name === "node_modules" || e.name === ".git" || e.name === ".next" || e.name === "vendor") continue;
            const itemPath = path.join(current, e.name);
            if (e.isDirectory()) {
              walk(itemPath);
            } else if (e.isFile()) {
              if (args.file_extension && !e.name.endsWith(args.file_extension)) continue;
              try {
                const text = fs.readFileSync(itemPath, "utf-8");
                if (text.includes(args.query)) {
                  const rel = path.relative(projectDir, itemPath);
                  const lines = text.split("\n");
                  lines.forEach((line, idx) => {
                    if (line.includes(args.query) && results.length < maxResults) {
                      results.push({
                        file: rel,
                        line: idx + 1,
                        snippet: line.trim().slice(0, 150)
                      });
                    }
                  });
                }
              } catch {}
            }
          }
        }

        walk(targetDir);
        return JSON.stringify({ query: args.query, matches: results, total_matches: results.length });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: `Tool execution failed: ${err.message}` });
  }
}
