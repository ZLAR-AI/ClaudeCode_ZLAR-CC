# ZLAR for Claude Code — Project Guide

## What this is

ZLAR-CC is a policy enforcement gateway that intercepts Claude Code tool calls via the hooks protocol. Every action the agent takes — shell commands, file writes, network requests — is classified, matched against a signed policy, and either passed through instantly or held for human approval via Telegram.

## Two Architectures

This repo contains two generations:

### v2 — Bash Gate (recommended, personal use)

```
Claude Code (agent)
    |
    | PreToolUse hook — fail-closed, synchronous
    v
.claude/hooks/zlar-gate.sh (thin wrapper)
    |
    v
bin/zlar-gate (857-line bash gate)
    |-- Translates all 10 Claude Code tools to domains
    |-- Evaluates against JSON policy with Ed25519 verification
    |-- Asks Telegram for "ask" actions
    |-- Writes JSONL audit trail with hash chain
    v
etc/policies/active.policy.json — Ed25519 signed, human-owned
```

### v1 — TypeScript Gateway (complex deployments)

```
Claude Code (agent)
    |
    | PreToolUse hook — fail-closed
    v
Gateway (port 3000)
    |-- hooks.ts, classifier.ts, matcher.ts
    |-- pending-store-sqlite.ts (SQLite WAL)
    |-- telegram.ts
    v
config/policy.yaml — Ed25519 signed, human-owned
```

## Core principles

1. **Fail closed.** Unknown tools denied. Unmatched rules denied. Gate down = all denied.
2. **No intelligence in the gate.** Classify, halt, ask. No LLM, no ML, no heuristics.
3. **The policy is a human artifact.** Signed with Ed25519. AI cannot modify the rules that govern it.
4. **Deterministic.** Same input, same output, always.

## Key source files

### v2 (bash gate)
- `bin/zlar-gate` — main gate script (reads hook stdin, classifies, evaluates policy, Telegram, audit)
- `bin/zlar-policy` — policy CLI (keygen, sign, verify, deploy, inspect, diff, prune)
- `.claude/hooks/zlar-gate.sh` — thin wrapper that pipes stdin to bin/zlar-gate
- `etc/policies/default.policy.example.json` — template policy (19 rules)
- `etc/gate.example.json` — gate configuration
- `scripts/zlar-setup.sh` — one-command setup for new users
- `scripts/zlar-start.sh` — verification script (11 checks)

### v1 (TypeScript gateway)
- `packages/gateway/src/hooks.ts` — Claude Code tool call entry point
- `packages/gateway/src/classifier.ts` — two-stage risk classifier
- `packages/gateway/src/matcher.ts` — policy rule evaluation
- `packages/gateway/src/telegram.ts` — Telegram approval UX
- `packages/gateway/src/pending-store-sqlite.ts` — SQLite pending store
- `packages/shared/src/types.ts` — all type definitions
- `packages/shared/src/crypto.ts` — Ed25519 signing/verification
- `packages/shared/src/policy.ts` — policy loader with signature check
- `config/policy.example.yaml` — template policy (YAML format)
- `docs/classifier-spec.md` — authoritative classifier specification

## Setup (v2 — recommended)

```bash
./scripts/zlar-setup.sh    # one-command setup
# Then edit .env and etc/gate.json with your Telegram credentials
```

## Development (v1)

```bash
npm install
npm run build
npm run dev:gateway    # start gateway
npm run dev:mock-api   # start test API
npm run dev:agent      # run test scenarios
```

## Policy changes

### v2 (JSON policy)
```bash
# Edit etc/policies/active.policy.json, then:
bin/zlar-policy sign --input etc/policies/active.policy.json --key ~/.zlar-signing.key
bin/zlar-policy verify --input etc/policies/active.policy.json
```

### v1 (YAML policy)
```bash
npm run sign-policy    # re-sign with your private key
npm run verify-policy  # verify signature
```

## Classifier

Two stages. Stage 1: five binary boundedness checks (any true = Tier 4). Stage 2: three-axis scoring (irreversibility, consequence, blast radius). `tier = max(axes)`. See `docs/classifier-spec.md` for full spec.
