# Changelog

All notable changes to ZLAR-CC will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/).

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
