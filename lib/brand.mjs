import path from "node:path";
import fs from "node:fs";

/**
 * Single Source of Truth for Vera AI Branding and Compatibility Hierarchy.
 */
export const BRAND = {
  id: "vera",
  bin: "vera",
  name: "Vera AI",
  tagline: "Autonomous AI Principal Architect & Code Engineer",
  version: "2.2.0",

  // Storage and directories
  configDir: ".vera",
  globalConfigDirName: ".vera",
  legacyDirs: [".signor", "sol"],
  dbFileName: "vera.sqlite",
  legacyDbFiles: ["signor.sqlite", "signor.db"],

  // Artifact file names
  planArtifact: "vera_plan.md",
  reviewArtifact: "vera_review.md",
  auditArtifact: "vera_audit.md",
  legacyArtifacts: {
    plan: ["signor_plan.md", "sol_plan.md"],
    review: ["signor_review.md", "sol_review.md"],
    audit: ["signor_audit.md"]
  },

  // Environment variables
  envPrefix: "VERA",
  legacyEnvPrefixes: ["SIGNOR", "SOL"],

  // Cockpit
  cockpitHeader: "X-Vera-Token",
  cockpitTitle: "Vera Developer Cockpit",
  cockpitPort: 5050,

  // AI Personas
  personaTitle: "Lead Software Architect & Principal Engineering Director",
  qaTitle: "Principal QA Reviewer & Chief Software Auditor",
  auditorTitle: "Principal System Auditor & Enterprise Architect"
};

/**
 * Resolves the configuration directory for a project with backwards compatibility fallback.
 * Checks for .vera first, then falls back to .signor or sol.
 */
export function resolveConfigDir(projectDir = process.cwd(), ensureExists = false) {
  const primary = path.join(projectDir, BRAND.configDir);
  if (fs.existsSync(primary)) return primary;

  for (const legacy of BRAND.legacyDirs) {
    const candidate = path.join(projectDir, legacy);
    if (fs.existsSync(candidate)) return candidate;
  }

  if (ensureExists && !fs.existsSync(primary)) {
    fs.mkdirSync(primary, { recursive: true });
  }

  return primary;
}

/**
 * Resolves the SQLite database file path.
 */
export function resolveDbPath(projectDir = process.cwd()) {
  const configDir = resolveConfigDir(projectDir);
  const primaryDb = path.join(configDir, BRAND.dbFileName);
  if (fs.existsSync(primaryDb)) return primaryDb;

  for (const legacyName of BRAND.legacyDbFiles) {
    const candidate = path.join(configDir, legacyName);
    if (fs.existsSync(candidate)) return candidate;
  }

  return primaryDb;
}

/**
 * Resolves API Key checking VERA_API_KEY first, then SIGNOR_API_KEY, SOL_API_KEY.
 */
export function resolveBrandApiKey() {
  const primary = process.env[`${BRAND.envPrefix}_API_KEY`];
  if (primary) return primary.trim();

  for (const legacyPrefix of BRAND.legacyEnvPrefixes) {
    const legacy = process.env[`${legacyPrefix}_API_KEY`];
    if (legacy) return legacy.trim();
  }

  return "";
}
