---
name: fix
description: Automatically remediate code issues, test failures, or security findings using Vera AI staged change sets. Triggered via /fix [issue].
---

# Quality Remediation & Auto-Fix (Vera AI)

Use this skill when the developer types `/fix` to resolve issues discovered during review or audit.

## Execution
Ask Vera to inspect and stage code modifications:
```bash
vera ask "قم بإصلاح العطل التالي وتعديل الكود المطلوب: <issue>"
```
Review the staged colorized diff and confirm application to disk.
