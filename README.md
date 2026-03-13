# ZLAR-CC — The Gate Between Claude Code and Your Machine

**You gave Claude Code bypass permissions. Good. Now govern them.**

ZLAR-CC is a policy enforcement gateway that intercepts every Claude Code tool call — shell commands, file writes, network requests, all ten tools — classifies the risk with a deterministic engine, matches against your signed policy, and either passes through instantly or holds for your approval on Telegram.

95% of actions flow through at zero latency. The 5% that matter — destructive commands, network exfiltration, privilege escalation — halt and wait for you.

**The gate has no intelligence. That's the feature.** No ML. No LLM watching another LLM. Deterministic string matching against a human-authored, cryptographically signed policy. You can read every rule in the source.

---

## Who Built This

**Vincent Nijjar** built ZLAR-CC. It's a product of **[ZLAR Inc.](https://zlar.ai)**, a Canadian corporation (est. 2025) that builds agent governance infrastructure.

ZLAR-CC is the second product in the ZLAR family. The first — **[ZLAR-OC](https://github.com/ZLAR-AI/ZLAR-OC)** — provides OS-level containment for agents running on [OpenClaw](https://openclaw.com). ZLAR-CC brings the same governance architecture to Claude Code's tool-call layer.

Both products share one thesis: **intelligence above, enforcement below, human authority over both.**

---

## The Problem

Claude Code with bypass permissions is the most productive coding setup available today. It reads, writes, executes, searches — all without stopping to ask. That's the point.

But bypass permissions mean every tool call executes without review. Every `rm`, every `git push`, every `curl` to an external endpoint. The agent operates on your real filesystem, your real credentials, your real network — at machine speed.

You have two options:

1. **No bypass** — Claude asks permission for everything. Safe but slow. You spend half your time clicking "Allow."
2. **Full bypass** — Claude does everything instantly. Fast but unguarded. One bad command, one hallucinated path, one exfiltration attempt — and it's already happened.

There's no middle ground built in. ZLAR-CC creates one.

---

## What ZLAR-CC Does

ZLAR-CC hooks into Claude Code via the [hooks protocol](https://docs.anthropic.com/en/docs/claude-code/hooks) (PreToolUse). Every tool call is intercepted before execution.

```
Claude Code
    │
    │ PreToolUse hook — fail-closed
    ▼
ZLAR-CC Gateway
    │── classifier  → two-stage risk classification (bounded? → scored)
    │── matcher     → evaluates against your signed policy rules
    │── telegram    → sends approval requests to your phone
    │
    ├── PASS   → instant, invisible, zero latency
    ├── GREEN  → auto-approved, silent notification
    ├── YELLOW → one-tap approval on Telegram
    └── RED    → two-step confirmation on Telegram
```

### All 10 Claude Code Tools Governed

| Tool | Internal Route | Default Behavior |
|------|---------------|-----------------|
| `Bash` | `POST /exec` | Always gated |
| `Write` | `POST /file/write` | Policy-dependent |
| `Edit` | `POST /file/write` | Policy-dependent |
| `Read` | `GET /file/read` | Sensitive paths gated |
| `Glob` | `GET /file/read` | Sensitive paths gated |
| `Grep` | `GET /file/read` | Sensitive paths gated |
| `NotebookEdit` | `POST /file/write` | Policy-dependent |
| `Task` | `POST /exec` | Always gated |
| `WebFetch` | `POST /net/request` | Always gated |
| `WebSearch` | `POST /net/request` | Always gated |

Unknown tools are denied by default. If Claude Code ships new tools tomorrow, they're blocked until you add a rule.

---

## Two-Stage Risk Classifier

No ML. No LLM calls. Deterministic, auditable, readable.

### Stage 1 — Boundedness Check

Five binary conditions. If any is true → Tier 4. Always halts. No auto-approve possible.

1. **Crosses trust boundary** — network to unknown domain, data exfiltration, `git push`
2. **Modifies enforcement layer** — writes to ZLAR source, policy files, firewall config
3. **Grants privileges** — `sudo`, `chmod`, `chown`, permission escalation
4. **Self-replicates** — `nohup`, background (`&`), `cron`, `launchctl`, spawn agents
5. **Unbounded resource amplification** — fork bombs, infinite loops, disk fill without cap

### Stage 2 — Risk Scoring (bounded actions only)

Three axes, scored 0–3. Worst axis wins.

- **Irreversibility** — can you undo it?
- **Consequence** — what changes?
- **Blast radius** — how much is affected?

`tier = max(irreversibility, consequence, blastRadius)`

| Tier | Color | What happens |
|------|-------|-------------|
| 0–1 | Green | Auto-approved, silent notification |
| 2 | Yellow | One-tap approval on Telegram |
| 3–4 | Red | Two-step confirmation on Telegram |

Full classifier specification: [docs/classifier-spec.md](docs/classifier-spec.md)

---

## Cryptographic Policy

Your policy defines the rules. JSON — human-readable, human-authored. Signed with Ed25519.

```json
{
  "rules": [
    {
      "domain": "bash",
      "detail": { "regex": "^(ls|pwd|cat|head|tail|wc|echo|date|whoami)\\b" },
      "action": "allow",
      "description": "Safe read-only commands"
    },
    {
      "domain": "bash",
      "detail": { "contains": "rm " },
      "action": "ask",
      "description": "Deletion requires approval"
    },
    {
      "domain": "bash",
      "action": "deny",
      "description": "Everything else denied"
    }
  ],
  "defaultAction": "deny"
}
```

The gateway refuses to start with a tampered policy. The signing key never touches the agent's environment.

**AI writes code. Humans write rules.**

---

## Fail-Closed by Design

| Scenario | Result |
|----------|--------|
| Gateway down | All actions denied |
| Unknown tool | Denied |
| No policy match | Denied |
| Telegram unreachable | Waits until timeout, then denied |
| Tampered policy | Gateway refuses to start |

ZLAR-CC fails safe. A blocked action is always safer than an unauthorized one.

---

## Using Multiple Editors?

**[ZLAR Gate](https://github.com/ZLAR-AI/ZLAR-Gate)** — same engine, one policy across Claude Code, Cursor, and Windsurf. If you use more than one AI coding framework, ZLAR Gate governs all of them from a single signed policy file.

## Quick Start

### Prerequisites

- **bash** 4+ (macOS ships 3.x — `brew install bash` if needed)
- **jq** — JSON processor (`brew install jq` on macOS, `apt install jq` on Linux)
- **openssl** with Ed25519 support (macOS LibreSSL may lack it — `brew install openssl`)
- **curl**
- A **Telegram bot token** (create via [@BotFather](https://t.me/botfather))
- Your **Telegram chat ID** (message [@userinfobot](https://t.me/userinfobot) to get it)

### Install

```bash
git clone https://github.com/ZLAR-AI/ClaudeCode_ZLAR-CC.git
cd ClaudeCode_ZLAR-CC
```

### One-Command Setup

```bash
./scripts/zlar-setup.sh
```

This handles everything:
1. Checks all prerequisites (jq, openssl Ed25519 support, curl, bash version)
2. Copies config templates (`etc/gate.json`, policy, `.env`)
3. Walks you through Telegram configuration
4. Generates Ed25519 signing keypair
5. Signs the default policy
6. Configures Claude Code hooks in `~/.claude/settings.json`
7. Runs verification

### After Setup

```bash
# 1. Edit .env — add your Telegram bot token
#    ZLAR_TELEGRAM_TOKEN=your_token_here

# 2. Edit etc/gate.json — set your Telegram chat ID
#    "chat_id": "123456789"

# 3. Review etc/policies/active.policy.json — customize rules
#    Then re-sign: bin/zlar-policy sign --input etc/policies/active.policy.json --key ~/.zlar-signing.key

# 4. Verify anytime
./scripts/zlar-start.sh
```

Open Claude Code. ZLAR-CC is now gating every tool call. You'll see approval requests on Telegram when Claude Code tries protected actions.

### Advanced: TypeScript Gateway (v1)

For complex deployments requiring a persistent HTTP gateway with SQLite persistence:

```bash
npm install
npm run build
npm run dev:gateway
```

See `config/policy.example.yaml` for the YAML policy format used by v1. Most users should start with the bash gate above.

---

## Telegram Approval UX

- Traffic light notifications — green (silent), yellow (one-tap), red (two-step)
- "Details" button shows the full classifier reasoning in plain English
- 800ms debounce prevents accidental taps
- Risk-based timeouts — yellow: 1 hour, red: 24 hours
- `/pending` command shows all actions awaiting your decision

---

## Project Structure

```
packages/
  shared/       — Types, crypto (Ed25519), policy loader, audit logger
  gateway/      — The gate: hooks, classifier, matcher, Telegram, pending store
  mock-api/     — Demo financial API for testing (balance, transfer, trade)
  agent/        — Test scenarios and reporter
  tools/        — CLI: keygen, sign, verify
bin/            — 9 CLI tools (gate, audit, karma, journal, policy, health, etc.)
config/         — Example policy templates (YAML and JSON formats)
docs/           — Classifier specification
etc/            — Gateway config, key storage, policy archive
scripts/        — Start, stop, harden, unharden
```

---

## What ZLAR-CC Is Not

- **Not AI safety research.** ZLAR is acceleration infrastructure. It makes Claude Code more deployable, not more constrained.
- **Not AI watching AI.** Intelligence cannot be trusted with power. The gate is deterministic string matching against signed rules.
- **Not a sandbox.** ZLAR-CC doesn't virtualize or contain. It gates. Claude Code operates on your real system — with a human-controlled boundary at the execution layer.

---

## The ZLAR Family

| Product | Platform | What it does |
|---------|----------|-------------|
| **[ZLAR-OC](https://github.com/ZLAR-AI/ZLAR-OC)** | OpenClaw | OS-level containment — user isolation, kernel sandbox, pf firewall, gate daemon, signed policy, audit trail |
| **ZLAR-CC** (this repo) | Claude Code | Hook-based gate — tool-call interception, risk classification, signed policy, Telegram approval |
| **[ZLAR Gate](https://github.com/ZLAR-AI/ZLAR-Gate)** | Claude Code + Cursor + Windsurf | Universal gate — one policy across multiple editors, framework-specific adapters |
| **[ZLAR-LT](https://github.com/ZLAR-AI/ZLAR-LT)** | Claude Code + Cursor + Windsurf | Zero-config governance — one command, instant protection, deny-heavy defaults |

Same thesis. Same architecture pattern. Different enforcement surfaces.

---

## License

[Apache License 2.0](LICENSE) — free to use, modify, and distribute.

Copyright 2025–2026 ZLAR Inc.

---

## Contact

- **ZLAR Inc.** — [zlar.ai](https://zlar.ai) · [hello@zlar.ai](mailto:hello@zlar.ai)
- **Vincent Nijjar** — Founder · [@VinnyNijjar](https://x.com/VinnyNijjar)
- **Issues** — [GitHub Issues](https://github.com/ZLAR-AI/ClaudeCode_ZLAR-CC/issues)

Built by Vincent Nijjar and [ZLAR Inc.](https://zlar.ai)
