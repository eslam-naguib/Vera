# ⚡ Signor AI

<div align="center">

**Global AI Software Architect CLI & Real-Time Developer Cockpit**

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![Version](https://img.shields.io/badge/version-2.1.0-blue?style=flat-square)](package.json)
[![Tests](https://img.shields.io/badge/tests-20%2F20%20passing%20(286ms)-success?style=flat-square)](tests/)
[![Quality Gate](https://img.shields.io/badge/quality%20gate-deterministic-purple?style=flat-square)](#-deterministic-quality-gate)
[![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Architecture](https://img.shields.io/badge/architecture-ACID%20SQLite%20Ledger-orange?style=flat-square)](#-architecture-overview)

[English Documentation](#-features) • [دليل الاستخدام بالعربية (Arabic Guide)](SIGNOR_GUIDE.md) • [CLI Commands](#-cli-command-reference) • [Developer Cockpit](#-developer-cockpit)

</div>

---

## 🌟 What is Signor?

**Signor** is an enterprise-grade AI Software Architect and QA Lead built for production engineering teams. It operates either as an OS-wide global CLI or within any project workspace, delivering:

1. **Deterministic Code Review Pipeline**: Gathers `git diff` and project delta in milliseconds, enforces fail-closed automated test suites, and streams deep architectural reviews via `gpt-5.6-sol` in **under 60 seconds** (compared to traditional 30-minute unconstrained loops).
2. **Architectural Planning**: Generates complete, step-by-step master engineering roadmaps with zero static mock data and verified schema constraints.
3. **Developer Cockpit Web UI**: A lightweight, authenticated local dashboard (`http://localhost:5050`) featuring real-time Model Health Radars, ACID run ledgers, and token latency gauges.
4. **Resilient Security Shield**: Zero leaked API keys, safe path resolution (`realpath` symlink/traversal blocks), and SSRF validation against private ranges and cloud metadata.

---

## ⚡ The Deterministic Review Pipeline

```
┌─────────────────────────┐     ┌──────────────────────────┐     ┌──────────────────────────┐
│   1. Git Delta Scan     │ ──> │ 2. Quality Gate (Tests)  │ ──> │ 3. Live Token Streaming  │
│   (1.5s local scan)     │     │ (20/20 tests in 443ms)   │     │ (gpt-5.6-sol deep audit) │
└─────────────────────────┘     └──────────────────────────┘     └──────────────────────────┘
                                                                               │
                                                                               ▼
                                                                 ┌──────────────────────────┐
                                                                 │ VERDICT: APPROVED / REQ  │
                                                                 │ Saved: signor_review.md  │
                                                                 └──────────────────────────┘
```

---

## 🚀 Quickstart

### 1. Global Installation (Once per Machine)

```bash
# Clone the repository
git clone https://github.com/eslam-naguib/signor.git
cd signor

# Link globally into your system PATH
npm link
```

### 2. Global Configuration

Set your credentials and preferred model once — all projects will automatically inherit them:

```bash
signor config set api_key "YOUR_API_KEY" -g
signor config set base_url "https://api.code.signor.ai/v1" -g
signor config set model "gpt-5.6-sol" -g
signor config set effort "high" -g
```

Verify your connection:
```bash
signor ping
# ✅ Connected to Signor AI (gpt-5.6-sol) in 412ms!
```

### 3. Initialize in Any Project

```bash
cd /path/to/any-project
signor init
```
This creates a local `.signor/` workspace directory with an embedded SQLite ledger and inherits your global config.

---

## 💻 Daily Engineering Workflow

### 📐 Master Architectural Planning
```bash
signor plan "Implement Stripe subscription billing with idempotent webhooks and tenant isolation"
```
- Outputs comprehensive Markdown to `.signor/signor_plan.md`.
- Automatically archived with timestamp in `.signor/plans/`.

### 🔍 Deterministic Code Review
```bash
# Review the whole project's latest changes:
signor review

# Or target a specific module:
signor review packages/billing
```
- **Execution Time:** ~45–60 seconds total.
- **Fail-Closed Rule:** If automated tests fail, Signor deterministically overrides any model approval with `VERDICT: CHANGES REQUIRED`.
- **Live Output:** Streams markdown analysis directly to your terminal.

### 🔬 Full-Spectrum System Audit
```bash
signor audit
```
- Analyzes repository topology, routes, schemas, and configurations.
- Generates security, performance, and transaction integrity ratings in `.signor/signor_audit.md`.

### 🎛️ Developer Cockpit (Web UI)
```bash
# Start the Cockpit on http://localhost:5050
signor cockpit start

# Start in background mode (daemon)
signor cockpit start -d

# Check status
signor cockpit status

# Stop server
signor cockpit stop
```

---

## 📋 CLI Command Reference

| Command | Description |
|---|---|
| `signor ping` | Test upstream API latency and model availability |
| `signor models` | Display model health radar and latency metrics |
| `signor init` | Initialize Signor workspace in current directory |
| `signor plan "<task>"` | Formulate architectural master plan in Arabic |
| `signor review [path]` | Run deterministic quality gate + live streaming code review |
| `signor audit` | Perform full-spectrum architectural and security audit |
| `signor cockpit [start\|stop\|status]` | Manage local developer dashboard web server |
| `signor config show` | Display active workspace and global configuration |
| `signor config set <k> <v> [-g]` | Update setting locally or globally (`-g`) |

### Command Flags

Append flags to **any** command to override settings on the fly:

```bash
# Temporarily switch to low effort for blazing fast response (< 15s)
signor review --effort low

# Temporarily switch models
signor review --model claude-3-7-sonnet

# Specify a custom endpoint
signor ping --base-url https://custom-endpoint.com/v1
```

| Effort Level | Temperature | Max Tokens | Timeout | Best Used For |
|---|:---:|:---:|:---:|---|
| **`low`** | `0.30` | 1,500 | 60s | Fast checks, quick validations (< 15s) |
| **`medium`** | `0.20` | 3,000 | 180s | Standard features and refactors |
| **`high`** *(default)* | `0.15` | 5,000 | 420s | Deep architectural audits and reviews |
| **`ultra`** | `0.10` | 8,000 | 600s | Multi-repo master planning and enterprise audits |

---

## 🛡️ Architecture & Security Guarantees

- **Zero Mock Data:** Real API calls, real deterministic quality gates, real SQLite ledger.
- **ACID Transactions:** Thread-safe SQLite transactions (`BEGIN IMMEDIATE`, `COMMIT`, `ROLLBACK`) with `busy_timeout: 5000ms`.
- **Secret Shield:** Keys are stored in `.signor/.key` with `0o600` permissions. UI and logs display masked tokens (`sk-m...1234`).
- **SSRF Prevention:** Blocks loopback (`127.0.0.1`, `localhost`), cloud metadata (`169.254.169.254`), and private RFC 1918 ranges.
- **Symlink & Path Traversal:** Canonical `realpath` checking blocks escapes escaping the workspace boundary.
- **Atomic File Writes:** Prevents corrupt state files by writing via unique nonced temp files and renaming atomically.

---

## 🧪 Automated Test Suite

Signor includes 20 comprehensive unit and integration tests executing natively on Node.js:

```bash
# Run test suite
npm test

# Output:
# 🧪 All test suites loaded and executed via node:test.
# ℹ tests 20 | suites 0 | pass 20 | fail 0 | duration_ms 286.1ms
```

---

## 📖 الدليل العربي الكامل (Arabic Documentation)

للحصول على شرح تفصيلي باللغة العربية لجميع خطوات التثبيت وسير العمل اليومي، راجع ملف:
👉 **[SIGNOR_GUIDE.md](SIGNOR_GUIDE.md)**

---

## 📄 License

MIT © 2026 [Eslam Naguib](https://github.com/eslam-naguib). Distributed under the MIT License.
