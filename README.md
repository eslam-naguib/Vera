# ⚡ Vera AI (formerly Signor AI)

<div align="center">

**Global Autonomous AI Principal Software Architect, Codebase Engine & Real-Time Developer Cockpit**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-2.2.0-blue?style=flat-square)](package.json)
[![Tests](https://img.shields.io/badge/tests-44%2F44%20passing%20(456ms)-success?style=flat-square)](tests/)
[![Context Engine](https://img.shields.io/badge/context%20engine-zero--token%20local-brightgreen?style=flat-square)](#-local-zero-token-context-engine)
[![Safety Gate](https://img.shields.io/badge/safety-staged%20diff%20approval-purple?style=flat-square)](#-safe-code-modification--approval-gate)
[![Antigravity Skills](https://img.shields.io/badge/antigravity-slash%20skills%20ready-orange?style=flat-square)](#-antigravity-slash-skills-suite)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

[English Documentation](#-what-is-vera) • [دليل التشغيل الشامل بالعربية (Arabic Guide)](VERA_GUIDE.md) • [CLI Commands](#-cli-command-reference) • [Slash Skills](#-antigravity-slash-skills-suite) • [Developer Cockpit](#-developer-cockpit)

</div>

---

## 🌟 What is Vera?

**Vera AI** (v2.2.0) is an enterprise-grade autonomous AI Principal Software Architect, Code Reviewer, and Engineering Copilot. Vera bridges the gap between high-level architectural reasoning and safe, deterministic codebase manipulation.

Unlike context-blind AI wrappers that waste thousands of API tokens reading entire directory trees repeatedly, Vera operates on a **Smart Division of Labor**:
1. **Local Deterministic Work (0 API Tokens):** Vera scans your project topology, detects frameworks, extracts dependency trees, analyzes git deltas, and validates schema constraints locally in milliseconds using native Node.js.
2. **Dense Reasoning Ingestion (< 800 Tokens):** Vera constructs a bounded, pre-digested architectural envelope and injects it directly into LLM prompts—ensuring maximum intelligence at minimal token cost.
3. **Full Code Access & Safe Modification:** Vera inspects code slices, searches patterns, and stages code changes in memory with colored unified diffs and SHA-256 integrity validation before prompting you for approval (`[y/N]`).
4. **Antigravity Slash Command Skills:** Fully integrated into Antigravity so `/vera`, `/plan`, `/debate`, `/review`, `/audit`, `/fix`, and `/cockpit` are always available at your fingertips.

> **Backward Compatibility Guarantee:** `signor` remains a fully supported alias. All existing `.signor/` workspaces, databases, and environment variables work seamlessly with zero migration needed.

---

## 🏗️ Core Architecture & Innovations

### 1. ⚡ Local Zero-Token Context Engine
```
┌────────────────────────────────────────────────────────┐
│  Local Deterministic Scanner (< 20ms, 0 API tokens)   │
│  - Framework detection: Next.js, Express, FastAPI...   │
│  - Landmarks: configs, entrypoints, schemas, models    │
│  - Compact Tree: filtered noise (node_modules, dist)   │
└──────────────────────────┬─────────────────────────────┘
                           │ Pre-digested Envelope (< 800 tokens)
                           ▼
┌────────────────────────────────────────────────────────┐
│  AI Architect Reasoning (GPT-6 Astra / Claude Fable)   │
│  High-value decision making, zero tokens wasted!       │
└────────────────────────────────────────────────────────┘
```

### 2. 🛡️ Safe Code Modification & Staged Approval Gate
Vera never writes blindly to your disk.
- **In-Memory Staging Buffer:** LLM tool calls (`write_file`, `edit_file`) stage modifications in memory.
- **Colorized Unified Diff:** Inspect exact additions (`+`) and deletions (`-`) in your terminal.
- **Anti-Race Condition Hash Lock:** Verifies the file has not been modified externally since reading.
- **User Confirmation Gate:** Prompts `[y/N]` before committing changes atomically. Auto-approve with `--apply` or `--yes` if running in automated CI/CD pipelines.

### 3. ⚔️ Multi-Agent Adversarial Debate Engine
Resolve tough architectural trade-offs using dialectical multi-agent synthesis:
```bash
vera debate "Migrate from monolith Postgres to event-driven Kafka + ClickHouse" \
  --agent1 gpt-6-astra --agent2 claude-fable-5-1 --rounds 3
```
- **Round 1 (Thesis):** Architectural proposal formulated by Agent 1.
- **Round 2 (Antithesis):** Rigorous, anti-sycophantic critique by Agent 2 targeting failure modes, concurrency bottlenecks, and operational overhead.
- **Round 3 (Synthesis):** Master consensus engineering plan incorporating mitigations.
- Recorded atomically in SQLite and exported to `.signor/plans/debate-*.md`.

---

## ⚡ Antigravity Slash Skills Suite

Vera comes with 7 native skills registered directly into Antigravity:

| Slash Command | Description |
|---|---|
| `/vera <goal>` | Launch Vera autonomous architect and code engineer with full codebase awareness |
| `/plan <task>` | Formulate a structured architectural master plan with zero hallucinations |
| `/debate <query>` | Trigger a multi-agent debate (Red vs Blue Hat or Multi-Model) |
| `/review [path]` | Run deterministic quality gate + live streaming code review |
| `/audit` | Perform full-spectrum architectural, security, and performance audit |
| `/fix <issue>` | Inspect, debug, stage changes, and preview unified diff for safe repair |
| `/cockpit` | Launch local developer telemetry web dashboard on `http://localhost:5050` |

To install or reinstall skills across your workspace or globally:
```bash
vera install-skill
```

---

## 🚀 Quickstart

### 1. Global Installation

```bash
# Clone the repository
git clone https://github.com/eslam-naguib/signor.git vera
cd vera

# Link globally into your system PATH
npm link
```
Now both `vera` and `signor` commands are available anywhere in your terminal.

### 2. Configure Credentials

```bash
# Set your API credentials globally
vera config set api_key "YOUR_API_KEY" -g
vera config set base_url "https://api.code.signor.ai/v1" -g
vera config set model "gpt-5.6-sol" -g
vera config set effort "high" -g

# Test connectivity
vera ping
# ✅ Connected to Vera AI (gpt-5.6-sol) in 398ms!
```

### 3. Initialize in Any Project

```bash
cd /path/to/my-project
vera init
```

---

## 💻 Daily CLI Usage

### 📐 Codebase-Aware Architectural Planning
```bash
vera plan "Design distributed multi-tenant billing with Stripe webhooks"
```

### 🔍 Deterministic Code Review (< 60s)
```bash
vera review
```
- Automatically extracts git deltas.
- Enforces local test suites (fail-closed).
- Streams architectural feedback with zero fluff.

### 🛠️ Consult & Edit Code Safely
```bash
vera ask "Refactor auth middleware to support bearer tokens and cookies" --apply
```

### 🔬 Full-Spectrum Audit
```bash
vera audit
```

### 🎛️ Developer Cockpit Web UI
```bash
vera cockpit start
# Opens real-time dashboard at http://localhost:5050
```

---

## 📋 CLI Command Reference

| Command | Alias | Description |
|---|---|---|
| `vera ping` | `signor ping` | Test upstream API latency and model availability |
| `vera models` | `signor models` | Display model health radar and latency metrics |
| `vera init` | `signor init` | Initialize Vera workspace in current directory |
| `vera ask "<query>"` | `signor ask` | Consult model with full local context and tool access |
| `vera plan "<task>"` | `signor plan` | Formulate architectural master plan in Arabic/English |
| `vera debate "<task>"` | `signor debate` | Multi-agent adversarial debate (Red vs Blue Hat) |
| `vera review [path]` | `signor review` | Deterministic quality gate + live streaming code review |
| `vera audit` | `signor audit` | Full-spectrum architectural and security audit |
| `vera apply` | `signor apply` | Inspect and commit staged changeset buffer |
| `vera install-skill` | `signor install-skill` | Register Antigravity slash commands |
| `vera cockpit [start\|stop\|status]` | `signor cockpit` | Developer dashboard web server |
| `vera config [show\|set]` | `signor config` | Manage local and global configurations |

---

## 🧪 Automated Test Suite

Vera includes 44 comprehensive unit and integration tests executing natively on Node.js:

```bash
npm test

# Output:
# 🧪 All test suites loaded and executed via node:test.
# ℹ tests 44 | suites 0 | pass 44 | fail 0 | duration_ms 456ms
```

---

## 📖 الدليل العربي الشامل (Arabic Documentation)

للحصول على شرح تفصيلي باللغة العربية لجميع خطوات التثبيت وسير العمل اليومي واستخدام الأوامر السريعة (Slash Commands)، راجع:
👉 **[VERA_GUIDE.md](VERA_GUIDE.md)**

---

## 📄 License

MIT © 2026 [Eslam Naguib](https://github.com/eslam-naguib). Distributed under the MIT License.
