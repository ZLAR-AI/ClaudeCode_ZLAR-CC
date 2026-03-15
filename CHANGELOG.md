# Changelog

All notable changes to ZLAR-CC will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

## [2.4.0] — 2026-03-15

### Added
- **MCP tool classification** — `mcp__<server>__<tool>` calls are classified as domain `mcp` and trigger approval by default (R095). Third-party MCP servers are now first-class governance subjects.
- **Internal tool fast-path** — `TodoWrite`, `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`, `TaskOutput`, `TaskStop`, `Skill`, `EnterWorktree`, `ExitWorktree` are reclassified as domain `internal` and auto-allowed without policy evaluation. Zero overhead for conversation-internal operations.
- **`denied_by` field in deny responses** — every deny now includes `[human]`, `[timeout]`, `[policy]`, `[rate_limit]`, or `[gate_error]` so the agent knows exactly why it was blocked.
- **`authorizer` field in audit events** — all events now record who authorized or denied the action: `human:<chat_id>`, `gate`, `policy`, `gate:timeout`, `gate:rate_limit`, `gate:error`, `watchdog`.
- **ERR trap** — unexpected failures in the gate script now deny + log the line number instead of silently passing or crashing.
- **Private temp directory** — gate uses `var/tmp` (chmod 700) instead of `/tmp`. World-readable temp files no longer possible.
- **Audit file rotation** — `audit.jsonl` rotates automatically at 10MB.
- **Atomic session write counters** — flock-based increment with fallback for systems without flock.
- **Distinct `telegram_ask()` exit codes** — 0=approved, 1=human denied, 2=send failure, 3=rate limited, 4=timeout.
- **Session ID in Telegram receipts** — approve/deny receipt messages now include the Claude Code session ID.

### Changed
- **R012 narrowed** — regex now targets specific ZLAR system paths only, not the entire ZLAR folder. Fixes field-test finding where R012 blocked all Bash commands in the ZLAR project directory.
- **Telegram title** — approval requests now show "ZLAR Gate" instead of "ZLAR Ask".
- **Newline injection hardening** — Bash command display collapses newlines before classification (S2 fix).
- **`TodoWrite`, `TaskOutput`, `TaskStop`, `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`, `Skill`, `EnterWorktree`, `ExitWorktree`** reclassified from `state`/`agent` to `internal` domain.

### Policy
- R012 regex narrowed (see above)
- R062 added: state domain allow rule (TodoWrite, TaskOutput, plan mode tools)
- R095 added: MCP tools → ask by default


---

## [Unreleased]

### Added
- Policy enforcement gateway for Claude Code via PreToolUse hooks protocol
- Two-stage deterministic risk classifier (boundedness check + three-axis scoring)
- All 10 Claude Code tools intercepted and mapped to internal format
- Ed25519 cryptographic policy signing and verification
- Telegram approval UX with traffic light tiers (green/yellow/red)
- Fail-closed hook script — gateway down = all denied
- 9 CLI tools: `zlar-gate`, `zlar-audit`, `zlar-karma`, `zlar-journal`, `zlar-policy`, `zlar-health`, `zlar-availability`, `zlar-brief`, `zlar-watchdog`
- SQLite WAL pending store for in-flight actions
- Example policies in YAML and JSON formats
- Classifier specification document (50-command adversarial test suite)
- Hardening and startup scripts

### Architecture
- TypeScript monorepo: shared, gateway, mock-api, agent, tools
- Bash CLI tools in bin/
- Hook integration via .claude/hooks/zlar-gate.sh

### Platform
- macOS (primary)
- Requires Node.js 20+, npm 10+

---

Built by Vincent Nijjar and [ZLAR Inc.](https://zlar.ai)
