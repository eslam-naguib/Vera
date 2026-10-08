---
name: debate
description: Conduct a multi-agent adversarial debate (Red Team vs Blue Team or cross-model duel) to stress-test architectural decisions and uncover blind spots. Triggered via /debate "<task>".
---

# Multi-Agent Architectural Debate (Vera AI)

Use this skill when the developer types `/debate` to stress-test design choices through adversarial dialectic.

## Execution
Run Vera debate command:
```bash
vera debate "<task>" --hats --effort1 medium --effort2 medium
```
Or cross-model:
```bash
vera debate "<task>" --agent1 astra --agent2 fable
```
