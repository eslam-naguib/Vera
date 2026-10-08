---
name: review
description: Inspect local Git diff against architectural requirements, run deterministic quality gates, and generate rigorous code review. Triggered via /review [path].
---

# Code Review & Deterministic Quality Gate (Vera AI)

Use this skill when the developer types `/review` before committing code or submitting a PR.

## Execution
Run Vera review command:
```bash
vera review
```
Executes git diff extraction, runs deterministic test suites (Quality Gate), and streams the comprehensive review.
