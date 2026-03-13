# ZLAR for Claude Code — Project Guide

## What this is

ZLAR-CC is a policy enforcement gateway that intercepts Claude Code tool calls via the hooks protocol. Every action the agent takes — shell commands, file writes, network requests — is classified, matched against a signed policy, and either passed through instantly or held for human approval via Telegram.

## Architecture

```
Claude Code (agent)
    |
    | PreToolUse hook — fail-closed
    v
Gateway (port 3000)
    |-- hooks.ts: translates 10 Claude Code tools to internal format
    |-- classifier.ts: two-stage risk classifier
    |-- matcher.ts: O(1) policy rule evaluation
    |-- pending-store-sqlite.ts: SQLite WAL persistence
    |-- telegram.ts: approval UX
    v
Policy (config/policy.yaml) — Ed25519 signed, human-owned
```

## Core principles

1. **Fail closed.** `defaultAction: "deny"`. Unknown tools denied. Unmatched routes denied. Gateway down = all denied.
2. **No intelligence in the gate.** Classify, halt, ask. No LLM, no ML, no heuristics.
3. **The policy is a human artifact.** Signed with Ed25519. AI cannot modify the rules that govern it.
4. **Deterministic.** Same input, same output, always.

## Key source files

- `packages/gateway/src/hooks.ts` — Claude Code tool call entry point
- `packages/gateway/src/classifier.ts` — two-stage risk classifier
- `packages/gateway/src/matcher.ts` — policy rule evaluation
- `packages/gateway/src/telegram.ts` — Telegram approval UX
- `packages/gateway/src/pending-store-sqlite.ts` — SQLite pending store
- `packages/shared/src/types.ts` — all type definitions
- `packages/shared/src/crypto.ts` — Ed25519 signing/verification
- `packages/shared/src/policy.ts` — policy loader with signature check
- `config/policy.example.yaml` — template policy
- `docs/classifier-spec.md` — authoritative classifier specification

## Development

```bash
npm install
npm run build
npm run dev:gateway    # start gateway
npm run dev:mock-api   # start test API
npm run dev:agent      # run test scenarios
```

## Policy changes

After editing `config/policy.yaml`:
```bash
npm run sign-policy    # re-sign with your private key
npm run verify-policy  # verify signature
```

## Classifier

Two stages. Stage 1: five binary boundedness checks (any true = Tier 4). Stage 2: three-axis scoring (irreversibility, consequence, blast radius). `tier = max(axes)`. See `docs/classifier-spec.md` for full spec.
