# ZLAR Two-Stage Classifier Specification

**Status:** Approved for implementation
**Date:** March 2026
**Author:** ZLAR Inc.

This is the implementation specification for the ZLAR classifier. It is not a
design exploration. Every section maps to code that must exist.

---

## 0. Core Invariant (Non-Negotiable)

ZLAR is a selectively permeable membrane.

Exploration is free. Propagation is gated at the boundary of unbounded
consequence.

The purpose is sovereignty first, safety as mechanism.

The classifier must preserve human authority while minimizing unnecessary
cognitive expenditure (human attention = ATP).

**If this invariant breaks, redesign. Do not patch.**

---

## 1. Stage 1 — Boundedness Check

**Properties:** Binary. Fast. Deterministic.

If ANY of the five unbounded conditions is true → Tier 4 (always halt, never
auto-approve, regardless of karma or history).

### Condition 1: `crosses_trust_boundary`

- Network request to domain not in allowlist
- Raw IP address (unless localhost)
- External push/send action (git push, email, webhook)
- Any action that exports data from the agent's internal space to the external
  world (exocytosis — once outside the membrane, you can't pull it back)

### Condition 2: `modifies_enforcement_layer`

- Write to ZLAR source directory
- Write to policy files
- Write to firewall config (`pf-zlar.conf`)
- Write to classifier code
- Write to any rule-governing surface
- If the agent can modify the membrane, it's not a membrane — it's a suggestion

### Condition 3: `grants_privileges`

- `chmod`, `chown`, `sudo`, `visudo`
- `sudoers` or group edits
- `dscl` (macOS directory service)
- Any permission expansion

### Condition 4: `self_replicates`

- `nohup`
- Background execution (`&`)
- `launchctl` (macOS service registration)
- `cron` / `crontab`
- Spawning sub-agents
- Any autonomous execution context that survives the parent session

### Condition 5: `unbounded_resource_amplification`

- Fork bomb signatures
- Infinite loops (`while true`, `for(;;)`)
- Recursive broad targets (`find / -exec`)
- Disk fill (`dd if=/dev/zero`)
- Unbounded process spawning
- Amplification pattern WITHOUT explicit cap

**Cap detection refinement:** If an amplification pattern exists but includes an
explicit numeric cap (`count=`, `{1..100}`, `-maxdepth`, `head -n`, etc.),
downgrade to Stage 2 scoring instead of Stage 1 halt.

### Stage 1 constraints

- Execute in <10ms
- Use only local deterministic checks (string matching, regex, AST if needed)
- Make no external calls (no network, no subprocess, no LLM)
- Be auditable by reading source — a human must be able to verify every rule
  by reading the code

If all five conditions are false → action is bounded → proceed to Stage 2.

---

## 2. Stage 2 — Risk Scoring (Bounded Actions Only)

Three axes, each scored 0–3 (coarse, no false precision):

### Axis 1: Irreversibility

| Score | Meaning |
|-------|---------|
| 0 | Trivially reversible (read, list, search) |
| 1 | Reversible with effort (file write with backup, config change) |
| 2 | Difficult to reverse (file delete without backup, package removal) |
| 3 | Effectively irreversible (data destruction, credential rotation) |

### Axis 2: Consequence Magnitude

| Score | Meaning |
|-------|---------|
| 0 | No observable effect beyond local state |
| 1 | Changes local file state |
| 2 | Changes system configuration or multiple files |
| 3 | Changes shared state, user-facing data, or critical config |

### Axis 3: Blast Radius

| Score | Meaning |
|-------|---------|
| 0 | Single file or scoped operation |
| 1 | Single directory or bounded set of files |
| 2 | Multiple directories or system-wide scope |
| 3 | Sensitive zone (see section 7) or unbounded scope |

### Tier assignment

`tier = max(irreversibility, consequence, blastRadius)`

No multiplication. No weighted averages. Coarse is correct — false precision
erodes trust in the system.

### Stage 2 purpose

- Prioritize human review (what to show first)
- Preserve attention budget (what can flow without a tap)
- Avoid unnecessary escalation (not everything needs to be red)

### Hard rule

Stage 2 must NEVER override Stage 1. If Stage 1 says unbounded, the action is
Tier 4 regardless of what Stage 2 would score.

---

## 3. Domain Allowlist Model (Stage 1 Input)

Do NOT use a single static list. Define categories with different trust levels:

### Category A: `LOCAL_ONLY`

Always allowed. Not a trust boundary crossing.

- `localhost`
- `127.0.0.1`
- `::1`
- `[::1]`

### Category B: `EXPLICIT_TRUSTED`

Static list, defined by the human operator, stored in signed policy config.

Examples: `api.telegram.org` (required for ZLAR itself), domains the operator
explicitly adds.

### Category C: `PROJECT_SCOPED`

Inferred from the current project context:

- Git remote domains (parsed from `.git/config`)
- Package registry domains (parsed from lockfiles: `package-lock.json`,
  `yarn.lock`, `Cargo.lock`, etc.)

These are contextually trusted — the project already depends on them.

### Category D: `LEARNED_SUGGESTIONS`

Never auto-promoted. Never auto-allowed.

- Observed from repeated human approvals
- Surfaced as suggestions: "You've approved requests to `api.example.com` 12
  times. Add to explicit trusted?"
- Human must explicitly promote to Category B

### Domain handling rules

- Any domain outside A/B/C → Stage 1 halt (`crosses_trust_boundary`)
- Normalize domains (lowercase, strip trailing dots)
- Block raw IP addresses (except localhost)
- Handle punycode (internationalized domains must be checked in decoded form)
- Subdomain policy: `api.example.com` trusted does NOT mean `evil.example.com`
  is trusted. Exact match or explicit wildcard only.

---

## 4. ClassificationResult Type

The classifier must return a full reasoning object. Not just a tier number.

```typescript
interface ClassificationResult {
  tier: 0 | 1 | 2 | 3 | 4;
  bounded: boolean;

  unboundedReason?:
    | 'crosses_trust_boundary'
    | 'modifies_enforcement_layer'
    | 'grants_privileges'
    | 'self_replicates'
    | 'unbounded_resource_amplification';

  scores?: {
    irreversibility: { value: 0 | 1 | 2 | 3; reason: string };
    consequence:     { value: 0 | 1 | 2 | 3; reason: string };
    blastRadius:     { value: 0 | 1 | 2 | 3; reason: string };
  };

  explanation: string;
  detailLevel: 'lite' | 'full';
}
```

### Requirements

- `explanation` is mandatory for all tiers
- `detailLevel: 'lite'` permitted for Tier 0-1 (low-cost actions, brief reason)
- `detailLevel: 'full'` required for Tier >= 2 (full reasoning for review)
- `scores` present only when `bounded === true` (Stage 2 ran)
- `unboundedReason` present only when `bounded === false` (Stage 1 halted)
- Constraint discoverability: the human must be able to understand *why* any
  action was classified the way it was by reading the result

---

## 5. Separation of Concerns

### The classifier knows nothing about karma

The classifier produces a `ClassificationResult`. Period. It does not know
whether the agent is trusted, how many actions have been approved, or what
the human's current mood is.

### The enforcement layer uses classification + karma together

```typescript
function decide(
  action: Action,
  classification: ClassificationResult,
  karma: KarmaState
): Decision {
  // Hard rules (never overridden by karma)
  if (!classification.bounded) return 'halt';
  if (classification.tier >= 3) return 'halt';

  // Karma may promote Tier 2 only
  if (classification.tier === 2 && karma.canAutoApprove(action)) {
    return 'auto-approve';
  }

  // Tier 0-1: auto-approve (pass rules)
  if (classification.tier <= 1) return 'auto-approve';

  // Default: halt and ask
  return 'halt';
}
```

### Hard guarantees (enforced in code, not convention)

- `tier >= 3` → never auto-approve, regardless of karma
- `bounded === false` → never auto-approve, regardless of karma
- Karma is a convenience dial. Not a security control.
- These constraints must be enforced with runtime assertions, not just logic
  flow. If a code path somehow reaches auto-approve for an unbounded action,
  it should throw, not proceed.

---

## 6. Resource Amplification Detection (Detail)

### Patterns to detect

- **Loop detection:** `while true`, `while :`, `for(;;)`, `for i in $(seq ...)`
  without bound
- **Recursive operations:** `find / -exec`, `rm -rf /`, `chmod -R` on broad
  targets, `rsync` without explicit source/dest scoping
- **Parallel execution:** `xargs -P`, `parallel`, multiple `&` in sequence
- **Broad filesystem targets:** operations on `/`, `/home`, `/Users`, `/var`,
  `/etc` without path narrowing
- **Disk fill:** `dd if=/dev/zero`, `/dev/urandom` piped to file without count
- **Background execution with loop:** `nohup` + loop pattern, `&` + loop pattern

### Cap detection (downgrade to Stage 2)

If explicit numeric limit is present alongside amplification pattern:

- `count=N` (dd)
- `{1..N}` (bash brace expansion)
- `-maxdepth N` (find)
- `head -n N` (pipe cap)
- `-P N` with small N (xargs parallelism)
- `timeout N` (time-bounded)

→ Downgrade to Stage 2. The cap makes it bounded.

If no cap is detectable → Stage 1 halt (`unbounded_resource_amplification`).

---

## 7. Sensitive Local Zones

These paths represent sovereignty boundaries even though they don't cross the
network trust boundary.

### Zones

| Path | Sensitivity |
|------|-------------|
| `~/.ssh` | Key material, remote access config |
| `~/Library` (macOS) | Application state, keychains, preferences |
| `/Library` | System-wide application config |
| Keychain access (`security` command) | Credential store |
| Other user home dirs (`/Users/*`, `/home/*`) | Cross-user boundary |
| System config (`/etc`, `/var`) | System-wide state |
| `~/Desktop`, `~/Documents` | User's personal files (already protected) |
| ZLAR source directory | Self-modification (Stage 1 catches this) |

### Classification behavior

- ZLAR source / policy files → Stage 1 halt (`modifies_enforcement_layer`)
- `~/.ssh` write/delete → Stage 1 halt (`modifies_enforcement_layer` — SSH
  keys are enforcement-adjacent)
- Other sensitive zones → Stage 2 with `blastRadius: 3`
- Explanation must name the specific sensitive zone triggered

### Open question

Should `~/.ssh` reads also trigger Stage 1? The glass house problem: an agent
that reads `~/.ssh/config` knows what hosts are available. Current recommendation:
read-protect `~/.ssh` once the read-protect feature is built (CLAUDE.md priority
#3). Until then, Stage 2 with `blastRadius: 3` for reads.

---

## 8. Attention Budget Metrics

Human attention is ATP. The classifier must be measured by its energy efficiency,
not just its accuracy.

### Design goals

- Minimize false positives (unnecessary escalation wastes ATP)
- Preserve clarity of explanation (unclear messages waste ATP on re-reading)
- Escalate only when consequence is genuinely unbounded or high-risk
- Allow high exploration volume without scaling alert volume linearly

### Metrics to track

| Metric | What it measures |
|--------|-----------------|
| Escalations per 100 actions | Gate friction — lower is better if safety holds |
| False positive rate | Unnecessary halts — wastes human ATP |
| Average review time | Explanation quality — shorter = clearer |
| Regret rate | Post-approval reversals — the real failure metric |

### Relationship to classifier tuning

Classifier refinement is energy regeneration. Every false positive eliminated
returns ATP to the human. Every explanation made clearer reduces ATP per review.

But: never reduce escalation rate by loosening Stage 1. Stage 1 conditions are
non-negotiable. Reduce escalation rate by improving Stage 2 scoring accuracy
and explanation quality.

---

## 9. Adversarial Test Suite

Create a 50-command test list covering:

### Categories

1. **Safe operations** (~15 commands): `ls`, `cat`, `grep`, `echo`, `pwd`, file
   reads, directory listings, git status, git log, etc.

2. **Medium-risk bounded** (~10 commands): file writes to project dirs, `npm
   install`, `git commit`, config edits, file moves within project

3. **Hostile / unbounded** (~10 commands): `rm -rf /`, `sudo rm`, fork bombs,
   `dd if=/dev/zero of=/dev/sda`, `chmod -R 777 /`, `curl | bash`, exfiltration
   patterns

4. **Edge cases** (~10 commands): capped amplification (`find . -maxdepth 2`),
   localhost network requests, compound commands mixing safe and dangerous,
   quoted strings containing dangerous patterns, heredocs with suspicious content

5. **Resource amplifiers** (~5 commands): unbounded loops, broad recursive ops,
   background execution + loops, parallel execution without caps

### Test requirements

- Unit test both Stage 1 and Stage 2 outputs
- Verify `ClassificationResult` structure for every test case
- Regression suite must pass before any classifier merge
- Test both the classification AND the explanation quality
- Include the "capped amplification" downgrade path — verify it downgrades
  correctly and doesn't false-negative

---

## 10. Implementation Sequence

### Step 1: Pure refactor (no behavior change)

Extract current risk assessment from `telegram.ts` into a standalone
`classifier.ts` module. Same logic, same outputs, just separated. Verify no
behavior change with existing tests / manual testing.

### Step 2: ClassificationResult type

Add the `ClassificationResult` interface to `packages/shared/src/types.ts`.
Update the classifier to return this type. Update consumers (`hooks.ts`,
`telegram.ts`) to use the structured result.

### Step 3: Stage 1 implementation

Implement the five boundedness conditions. Each condition is a pure function
that takes the action and returns `boolean`. Stage 1 is the composition:
if any returns true → `{ bounded: false, tier: 4, unboundedReason: ... }`.

### Step 4: Stage 2 implementation

Implement three-axis scoring for bounded actions. Each axis is a pure function
returning `0 | 1 | 2 | 3` with a reason string. Tier = max of three scores.

### Step 5: Domain allowlist

Implement categories A/B/C. Category D (learned suggestions) is deferred — it
requires karma infrastructure.

### Step 6: Test suite

Build the 50-command adversarial test suite. Run against Stage 1 + Stage 2.
Fix any misclassifications. This suite becomes the regression gate.

### Step 7: Integration

Wire the classifier into the existing hook flow. Replace the current risk
assessment logic. Verify with manual testing against real Claude Code sessions.

---

## Constraints on Implementation

- No ML. No external dependencies for classification.
- No network calls during classification.
- No LLM-based risk assessment.
- Deterministic: same input → same output, always.
- Auditable: a human reading the source can verify every rule.
- Energy-aware: designed to minimize human ATP expenditure.
- Sovereignty-preserving: the human defines the channels, never the agent.
