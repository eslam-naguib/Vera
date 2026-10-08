import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { resolveSafePath } from "../security.mjs";
import { atomicWriteFileSync } from "../atomic.mjs";

let currentChangeSet = [];

/**
 * Returns a shallow copy of pending staged file changes.
 */
export function getPendingChangeSet() {
  return [...currentChangeSet];
}

/**
 * Returns the count of pending staged file changes.
 */
export function getPendingChangeCount() {
  return currentChangeSet.length;
}

/**
 * Clears the in-memory staging queue. Zero disk impact.
 */
export function clearPendingChangeSet() {
  currentChangeSet = [];
}

/**
 * Removes a specific pending change by relative path.
 */
export function removePendingChange(relPath) {
  const norm = relPath.replace(/\\/g, "/");
  const prevLen = currentChangeSet.length;
  currentChangeSet = currentChangeSet.filter(c => c.relPath !== norm);
  return currentChangeSet.length < prevLen;
}

/**
 * Stages a file creation or edit in memory without touching disk.
 * Supports chaining: if a file is modified multiple times in one session,
 * it preserves the base disk content and accumulates the diff.
 */
export function stageFileChange({ projectDir, filePath, operation, newContent, oldContent = "", baseSha256 = null }) {
  const safePath = resolveSafePath(filePath, projectDir);
  const relPath = path.relative(projectDir, safePath).replace(/\\/g, "/");

  const existingIdx = currentChangeSet.findIndex(c => c.relPath === relPath);
  
  // If already staged in this session, keep original disk oldContent and baseSha256
  const origOldContent = existingIdx >= 0 ? currentChangeSet[existingIdx].oldContent : oldContent;
  const initialBaseHash = baseSha256 || crypto.createHash("sha256").update(origOldContent || "").digest("hex");
  const targetHash = crypto.createHash("sha256").update(newContent).digest("hex");

  const { diffText, stats } = generateUnifiedDiff(origOldContent, newContent, relPath);

  const item = {
    relPath,
    fullPath: safePath,
    operation,
    oldContent: origOldContent,
    newContent,
    diffPreview: diffText,
    stats,
    baseSha256: initialBaseHash,
    targetSha256: targetHash,
    stagedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    currentChangeSet[existingIdx] = item;
  } else {
    currentChangeSet.push(item);
  }

  return item;
}

/**
 * Generates unified diff with line additions/deletions stats.
 */
export function generateUnifiedDiff(oldStr, newStr, filename) {
  const normOld = oldStr ? oldStr.replace(/\r\n/g, "\n").replace(/\n$/, "") : "";
  const normNew = newStr ? newStr.replace(/\r\n/g, "\n").replace(/\n$/, "") : "";

  const oldLines = normOld ? normOld.split("\n") : [];
  const newLines = normNew ? normNew.split("\n") : [];

  const diff = [];
  diff.push(`--- a/${filename}`);
  diff.push(`+++ b/${filename}`);

  let additions = 0;
  let deletions = 0;

  if (oldLines.length === 0) {
    diff.push(`@@ +1,${newLines.length} @@ (ملف جديد)`);
    for (const l of newLines) {
      diff.push(`+ ${l}`);
      additions++;
    }
  } else {
    diff.push(`@@ -1,${oldLines.length} +1,${newLines.length} @@`);
    let i = 0, j = 0;
    while (i < oldLines.length || j < newLines.length) {
      if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
        diff.push(`  ${oldLines[i]}`);
        i++;
        j++;
      } else {
        if (i < oldLines.length) {
          diff.push(`- ${oldLines[i]}`);
          deletions++;
          i++;
        }
        if (j < newLines.length) {
          diff.push(`+ ${newLines[j]}`);
          additions++;
          j++;
        }
      }
    }
  }

  return {
    diffText: diff.join("\n"),
    stats: { additions, deletions }
  };
}

/**
 * Formats unified diff with ANSI colors for clear terminal preview.
 */
export function formatColorizedDiff(diffStr) {
  if (!diffStr) return "";
  return diffStr
    .split("\n")
    .map(line => {
      if (line.startsWith("---") || line.startsWith("+++")) {
        return `\x1b[1m\x1b[35m${line}\x1b[0m`; // Bold Magenta
      } else if (line.startsWith("@@")) {
        return `\x1b[36m${line}\x1b[0m`; // Cyan
      } else if (line.startsWith("+")) {
        return `\x1b[32m${line}\x1b[0m`; // Green
      } else if (line.startsWith("-")) {
        return `\x1b[31m${line}\x1b[0m`; // Red
      }
      return `\x1b[90m${line}\x1b[0m`; // Dim/Gray
    })
    .join("\n");
}

/**
 * Verifies that on-disk files match the base state when staged (prevents race conditions & stale writes).
 */
export function verifyChangeSetIntegrity(changeSet, projectDir = process.cwd()) {
  const conflicts = [];

  for (const item of changeSet) {
    if (item.operation === "edit") {
      if (!fs.existsSync(item.fullPath)) {
        conflicts.push({
          relPath: item.relPath,
          reason: "ملف القرص تم حذفه خارجياً بعد التجهيز في الذاكرة (File missing on disk)."
        });
        continue;
      }
      const diskContent = fs.readFileSync(item.fullPath, "utf-8");
      const diskHash = crypto.createHash("sha256").update(diskContent).digest("hex");
      if (diskHash !== item.baseSha256) {
        conflicts.push({
          relPath: item.relPath,
          reason: "ملف القرص تم تعديله خارجياً بعد التجهيز (Dirty disk state: hash mismatch)."
        });
      }
    } else if (item.operation === "create") {
      if (fs.existsSync(item.fullPath)) {
        conflicts.push({
          relPath: item.relPath,
          reason: "الملف المراد إنشاؤه موجود بالفعل على القرص (Collision: file already exists)."
        });
      }
    }
  }

  return {
    ok: conflicts.length === 0,
    conflicts
  };
}

/**
 * Prints colorized unified diffs and prompts user for interactive confirmation [y/N].
 */
export async function promptUserApproval(changeSet) {
  if (!process.stdin.isTTY) {
    console.error(`\x1b[33m⚠️ [Signor Approval Gate] Non-interactive environment detected. Use --yes or --apply flag to auto-approve changes.\x1b[0m`);
    return false;
  }

  let totalAdd = 0;
  let totalDel = 0;
  for (const item of changeSet) {
    totalAdd += item.stats?.additions || 0;
    totalDel += item.stats?.deletions || 0;
  }

  console.log(`\n\x1b[1m\x1b[33m═══════════════════════════════════════════════════════════════════\x1b[0m`);
  console.log(`\x1b[1m\x1b[33m🛡️  [Signor Safety Approval Gate] مراجعة التغييرات المعلقة قبل الحفظ\x1b[0m`);
  console.log(`\x1b[1m\x1b[33m═══════════════════════════════════════════════════════════════════\x1b[0m`);
  console.log(`\x1b[36mالملفات المعلقة:\x1b[0m ${changeSet.length} ملف | \x1b[32m+${totalAdd} سطر\x1b[0m | \x1b[31m-${totalDel} سطر\x1b[0m\n`);

  for (const item of changeSet) {
    const opTag = item.operation === "create" ? "\x1b[32m[إنشاء CREATE]\x1b[0m" : "\x1b[33m[تعديل EDIT]\x1b[0m";
    console.log(`\x1b[1m${opTag} \x1b[4m${item.relPath}\x1b[0m \x1b[90m(SHA: ${item.targetSha256.slice(0, 10)}...)\x1b[0m:`);
    console.log(formatColorizedDiff(item.diffPreview));
    console.log(`\x1b[90m-------------------------------------------------------------------\x1b[0m\n`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`\x1b[1m\x1b[33mهل توافق على كتابة وتطبيق هذه التغييرات على القرص؟ [y/N]: \x1b[0m`, (ans) => {
      rl.close();
      const approved = ans.trim().toLowerCase() === "y" || ans.trim().toLowerCase() === "yes";
      resolve(approved);
    });
  });
}

/**
 * Safely applies pending changes to disk after integrity checks and approval.
 */
export async function applyPendingChangeSet({ autoApprove = false, projectDir = process.cwd() } = {}) {
  const pending = getPendingChangeSet();
  if (pending.length === 0) {
    return { applied: 0, status: "empty" };
  }

  // Integrity Check: ensure on-disk files haven't changed since staging
  const integrity = verifyChangeSetIntegrity(pending, projectDir);
  if (!integrity.ok) {
    console.error(`\n\x1b[1m\x1b[31m❌ [فشل التحقق من النزاهة والتطابق — Integrity Verification Failed]:\x1b[0m`);
    for (const c of integrity.conflicts) {
      console.error(`  \x1b[31m• ${c.relPath}: ${c.reason}\x1b[0m`);
    }
    console.error(`\x1b[33mتم إلغاء تطبيق التعديلات لحماية الكود من الكتابة فوق تغييرات خارجية.\x1b[0m\n`);
    return { applied: 0, status: "conflict", conflicts: integrity.conflicts };
  }

  if (!autoApprove) {
    const approved = await promptUserApproval(pending);
    if (!approved) {
      console.log(`\x1b[31m❌ تم إلغاء تطبيق التعديلات بناءً على رغبة المستخدم. القرص لم يُمس.\x1b[0m\n`);
      clearPendingChangeSet();
      return { applied: 0, status: "rejected" };
    }
  }

  let appliedCount = 0;
  for (const item of pending) {
    const targetDir = path.dirname(item.fullPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    atomicWriteFileSync(item.fullPath, item.newContent);
    appliedCount++;
    console.log(`\x1b[32m✔ [تطبيق آمن بالقرص]: ${item.relPath} (SHA: ${item.targetSha256.slice(0, 10)}...)\x1b[0m`);
  }

  const appliedItems = [...pending];
  clearPendingChangeSet();
  return { applied: appliedCount, status: "success", changes: appliedItems };
}
