---
name: plan
description: Generate comprehensive architectural master plan, component topology, and execution blueprint with Vera AI. Triggered via /plan "<task>".
---

# Architectural Planning & Blueprint Generator (Vera AI)

Use this skill when the developer types `/plan` or asks for architectural planning.

## Execution
Run Vera plan command:
```bash
vera plan "<task>"
```
*(Fallback: `node ./bin/vera.mjs plan "<task>"`)*

Outputs are saved in `.vera/vera_plan.md` (or `.signor/signor_plan.md`).
