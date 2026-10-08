import fs from "node:fs";
import path from "node:path";

const DEFAULT_IGNORED_DIRS = new Set([
  // VCS & IDEs
  ".git",
  ".svn",
  ".hg",
  ".idea",
  ".vscode",
  ".vs",

  // Node & Web build / artifacts
  "node_modules",
  ".pnpm",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".docusaurus",
  ".parcel-cache",
  ".turbo",
  "dist",
  "build",
  "out",
  "coverage",
  ".nyc_output",

  // Python environments & caches
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  ".venv",
  "venv",
  "env",

  // PHP / Composer
  "vendor",

  // Rust / Go / Native builds
  "target",
  "bin_obj",
  "obj",
  "Pods",
  "Carthage",
  ".gradle",

  // Temporary & Signor internal
  ".signor",
  "tmp",
  "temp",
  ".cache"
]);

const CONFIG_REGEX = /^(vite\.config|next\.config|nuxt\.config|svelte\.config|astro\.config|remix\.config|tsconfig|webpack\.config|tailwind\.config|postcss\.config|eslint|prettier|biome\.json|\.env\.example|docker-compose|dockerfile)/i;
const SCHEMA_REGEX = /(\.sql$|schema\.prisma$|drizzle\.config|\/schemas?\/|\/models?\/|\/entities?\/|\/migrations?\/|schema\.[a-z0-9]+$)/i;
const ENTRYPOINT_REGEX = /^(src\/(index|main|app|server)\.[a-z0-9]+|bin\/[a-z0-9._-]+|index\.[a-z0-9]+|main\.(py|go|rs)|app\.(py|js|ts)|manage\.py|artisan)/i;
const ROUTE_REGEX = /(\/routes?\/|\/api\/|\/controllers?\/|\/endpoints?\/|\/handlers?\/)/i;

/**
 * Builds a compact, filtered file tree of the project.
 * Implements token-budgeting guardrails: capped at maxPaths to preserve tokens.
 *
 * @param {string} projectDir - Root project path.
 * @param {object} options - Configuration overrides (maxPaths, maxDepth, ignoredDirs).
 * @returns {object} Filtered path collections and architectural landmarks.
 */
export function buildCompactFileTree(projectDir = process.cwd(), options = {}) {
  const maxPaths = options.maxPaths || 180;
  const maxDepth = options.maxDepth || 4;
  const ignored = options.ignoredDirs ? new Set(options.ignoredDirs) : DEFAULT_IGNORED_DIRS;

  const collectedPaths = [];
  const configs = [];
  const schemas = [];
  const entrypoints = [];
  const routes = [];

  let totalFilesScanned = 0;
  let truncated = false;

  function walk(currentDir, currentDepth) {
    if (collectedPaths.length >= maxPaths || currentDepth > maxDepth) {
      if (collectedPaths.length >= maxPaths) truncated = true;
      return;
    }

    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    // Sort: directories first, then files alphabetically
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      if (collectedPaths.length >= maxPaths) {
        truncated = true;
        return;
      }

      // Skip hidden files except common required manifests / dotfiles
      if (entry.name.startsWith(".") && entry.name !== ".env.example" && entry.name !== ".gitignore") {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(projectDir, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        if (ignored.has(entry.name)) continue;
        collectedPaths.push(relPath + "/");
        walk(fullPath, currentDepth + 1);
      } else if (entry.isFile()) {
        totalFilesScanned++;
        collectedPaths.push(relPath);

        // Landmark categorization
        if (CONFIG_REGEX.test(entry.name)) configs.push(relPath);
        if (SCHEMA_REGEX.test(relPath)) schemas.push(relPath);
        if (ENTRYPOINT_REGEX.test(relPath)) entrypoints.push(relPath);
        if (ROUTE_REGEX.test(relPath)) routes.push(relPath);
      }
    }
  }

  walk(projectDir, 1);

  return {
    paths: collectedPaths,
    configs: configs.slice(0, 10),
    schemas: schemas.slice(0, 15),
    entrypoints: entrypoints.slice(0, 10),
    routes: routes.slice(0, 12),
    totalFilesScanned,
    truncated,
  };
}
