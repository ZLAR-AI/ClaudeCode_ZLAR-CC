# Security Policy

## Scope

ZLAR-CC is a policy enforcement gateway for Claude Code. Its security boundary is the enforcement surface between Claude Code's tool calls and the host operating system — hook interception, risk classification, policy matching, cryptographic signing, and the approval channel.

Any vulnerability that allows an agent (or external attacker) to bypass, weaken, or tamper with the gate, the classifier, the policy, or the approval mechanism is in scope.

---

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:

1. Go to [ZLAR-AI/ZLAR-CC Security Advisories](https://github.com/ZLAR-AI/ZLAR-CC/security/advisories)
2. Click **"Report a vulnerability"**
3. Provide a clear description, reproduction steps, and affected components

We will acknowledge receipt within 48 hours and provide a timeline for remediation. We aim to resolve critical issues within 14 days.

If you cannot use GitHub's reporting tool, open a regular issue with the title **"Security concern — requesting private channel"** and we will establish one.

---

## Threat Model

ZLAR-CC defends against the following scenarios:

**Agent attempts to execute unauthorized actions.** Claude Code with bypass permissions can execute shell commands, write files, make network requests, and modify system configuration without human review. ZLAR-CC intercepts every tool call at the hook layer and evaluates it against a signed policy before execution.

**Agent attempts to modify its own governance.** Claude Code could attempt to edit the policy file, the hook script, the classifier, or ZLAR-CC's own source code. Stage 1 of the classifier detects enforcement-layer modification and halts unconditionally (Tier 4).

**Agent attempts to exfiltrate data.** Network requests to unknown domains, `git push` to unauthorized remotes, and `curl`/`wget` to external endpoints are classified as trust-boundary crossings (Tier 4 halt).

**Policy tampering.** An attacker (or the agent) attempts to modify enforcement rules after deployment. Ed25519 signature verification ensures any alteration is mathematically detectable. The gateway refuses to start with a tampered policy.

**Approval channel manipulation.** An attacker attempts to auto-approve actions via the Telegram bot. Risk-based timeouts, two-step confirmation for red-tier actions, and debounce guards mitigate this.

**Gateway bypass.** If the ZLAR-CC gateway is down or unreachable, the fail-closed hook script denies all actions. No gate = no action.

### Out of Scope

ZLAR-CC does not protect against compromise of the host operating system itself, physical access attacks, or vulnerabilities in Claude Code's runtime. It does not govern what happens inside the model's inference — it governs what the model can *do* on your machine.

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| main (HEAD) | Yes |
| Tagged releases | Yes, current and previous minor |

---

## Disclosure Policy

We practice coordinated disclosure. If you report a vulnerability, we will:

1. Acknowledge within 48 hours
2. Confirm the issue and assess severity within 7 days
3. Develop and test a fix
4. Release the fix and publish a security advisory
5. Credit you in the advisory (unless you prefer anonymity)

We ask that reporters refrain from public disclosure until a fix is available, or until 90 days have elapsed — whichever comes first.

---

## Security Design Principles

ZLAR-CC follows one invariant: **intelligence above, enforcement below, human authority over both.**

The gate has no intelligence. It classifies via deterministic string matching, matches against signed policy rules, and halts when the policy says halt. A mechanism too simple to be persuaded is a mechanism that cannot be socially engineered.

For detailed architecture:

- [Classifier Specification](docs/classifier-spec.md) — two-stage risk classification design
- [CLAUDE.md](CLAUDE.md) — architecture overview for developers
