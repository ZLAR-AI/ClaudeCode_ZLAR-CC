import { ClassificationResult } from '@zlar/shared';

/**
 * Two-stage reversibility classifier.
 *
 * Stage 1: Boundedness check — 5 binary conditions. If ANY is true, the action's
 * consequence is unbounded → Tier 4 (always halt, never auto-approve).
 *
 * Stage 2: Three-axis scoring for bounded actions. Each axis 0-3:
 *   - Irreversibility: can the action be undone?
 *   - Consequence: how bad if it goes wrong?
 *   - Blast radius: how much does it affect?
 * Risk = max(I, C, B). Worst axis wins.
 *
 * Tier mapping:
 *   4 = unbounded (always halt, enhanced review)
 *   3 = high risk (always halt, human decides)
 *   2 = moderate (karma-gated in future, halt for now)
 *   1 = low (auto-approve, notify)
 *   0 = observation (silent pass, logged)
 */

export interface ActionContext {
  /** exec | file_write | file_delete | file_move | file_read | net_request | net_dns | system_info */
  actionType: string;
  /** The file/URL being acted on */
  targetPath: string;
  /** Shell command text (for exec actions) */
  commandText: string;
  /** Display description from hooks (e.g. "POST /exec") */
  description: string;
  /** All params from the hook */
  params: Record<string, unknown>;
}

// ─── STAGE 1: BOUNDEDNESS CHECKS ───────────────────────────────────────────

const ENFORCEMENT_PATHS = /ZLAR|zlar-gate|policy-mac\.yaml|pf-zlar\.conf|pf\.conf|\/etc\/pf/i;

const PRIVILEGE_COMMANDS = /\b(sudo|chmod|chown|visudo|dscl)\b/;
const PRIVILEGE_TARGETS = /\/etc\/sudoers|\/etc\/group/;

const SELF_REPLICATE_PATTERNS = /\b(nohup|launchctl\s+load|crontab|setsid)\b|\s&\s*$/;

// Resource amplification — unbounded if no cap detected
const AMPLIFICATION_PATTERNS = [
  /:\(\)\{.*\|.*\}/,                    // fork bomb
  /while\s+(true|1|:)\b/,              // infinite loop
  /\byes\s*\|/,                         // yes pipe flood
  /\bfind\s+\/\s/,                      // find from root (no maxdepth)
  /\bdd\s+.*if=\/dev\/(zero|urandom)/,  // disk fill
  /\bfor\s*\(\s*;\s*;\s*\)/,           // C-style infinite for
  /python[23]?\s+-c\s+.*while\s+True/,  // python one-liner infinite
  /node\s+-e\s+.*setInterval/,          // node one-liner infinite
];

const CAP_PATTERNS = [
  /\bfor\s+\w+\s+in\s+\{[^}]+\}/,     // bounded bash for-in
  /\bhead\s+-n\s+\d+/,                  // head with limit
  /\bdd\s+.*count=\d+/,                 // dd with count
  /\b-maxdepth\s+\d+/,                  // find with maxdepth
  /\bxargs\s+.*-n\s+\d+/,              // xargs with chunk size
  /\btimeout\s+\d+/,                    // timeout wrapper
];

// Network trust boundary — known-safe destinations
const LOCAL_DESTINATIONS = /^(localhost|127\.0\.0\.1|::1|0\.0\.0\.0)/;
const TRUSTED_DOMAINS = /\b(github\.com|api\.github\.com|registry\.npmjs\.org|api\.anthropic\.com|api\.openai\.com)\b/;

// Actions that cross trust boundary
const NETWORK_SEND_COMMANDS = /\b(curl|wget|ssh|scp|rsync|git\s+push|git\s+remote|nc|ncat|netcat)\b/;

function checkCrossesTrustBoundary(ctx: ActionContext): string | null {
  // Network requests to unknown destinations
  if (ctx.actionType === 'net_request') {
    const url = String(ctx.params.url || '');
    if (LOCAL_DESTINATIONS.test(url)) return null;
    if (TRUSTED_DOMAINS.test(url)) return null;
    return `Network request to unknown destination: ${url}`;
  }

  // Exec commands that send data externally
  if (ctx.actionType === 'exec') {
    if (NETWORK_SEND_COMMANDS.test(ctx.commandText)) {
      // git push, curl, wget, ssh, etc.
      if (/\bgit\s+push\b/.test(ctx.commandText)) {
        return 'git push sends code to external repository';
      }
      if (/\b(curl|wget)\b/.test(ctx.commandText)) {
        // Check if destination is trusted
        const urlMatch = ctx.commandText.match(/https?:\/\/[^\s'"]+/);
        if (urlMatch) {
          if (LOCAL_DESTINATIONS.test(urlMatch[0])) return null;
          if (TRUSTED_DOMAINS.test(urlMatch[0])) return null;
        }
        return `Network command sends/receives data: ${ctx.commandText.slice(0, 80)}`;
      }
      if (/\b(ssh|scp|rsync)\b/.test(ctx.commandText)) {
        return 'SSH/SCP/rsync connects to remote machine';
      }
      if (/\b(nc|ncat|netcat)\b/.test(ctx.commandText)) {
        return 'Netcat opens raw network connection';
      }
    }
  }

  return null;
}

function checkModifiesEnforcement(ctx: ActionContext): string | null {
  if (ctx.actionType === 'file_write' || ctx.actionType === 'file_delete' || ctx.actionType === 'file_move') {
    if (ENFORCEMENT_PATHS.test(ctx.targetPath)) {
      return `Modifies ZLAR enforcement: ${ctx.targetPath}`;
    }
  }
  if (ctx.actionType === 'exec') {
    // Commands that modify firewall or ZLAR config
    if (/\bpfctl\b/.test(ctx.commandText)) return 'Modifies packet filter rules';
    if (ENFORCEMENT_PATHS.test(ctx.commandText)) {
      return `Command references enforcement layer: ${ctx.commandText.slice(0, 80)}`;
    }
  }
  return null;
}

function checkGrantsPrivileges(ctx: ActionContext): string | null {
  if (ctx.actionType === 'exec') {
    if (PRIVILEGE_COMMANDS.test(ctx.commandText)) {
      return `Privilege escalation: ${ctx.commandText.match(PRIVILEGE_COMMANDS)?.[0]}`;
    }
  }
  if ((ctx.actionType === 'file_write' || ctx.actionType === 'file_delete') && PRIVILEGE_TARGETS.test(ctx.targetPath)) {
    return `Modifies privilege config: ${ctx.targetPath}`;
  }
  return null;
}

function checkSelfReplicates(ctx: ActionContext): string | null {
  if (ctx.actionType === 'exec') {
    if (SELF_REPLICATE_PATTERNS.test(ctx.commandText)) {
      return `Creates persistent/background process: ${ctx.commandText.slice(0, 80)}`;
    }
    // Agent/Task tool spawns subprocesses
    if (ctx.commandText.startsWith('[Agent]')) {
      return 'Spawns sub-agent';
    }
  }
  return null;
}

function checkResourceAmplification(ctx: ActionContext): string | null {
  if (ctx.actionType !== 'exec') return null;

  for (const pattern of AMPLIFICATION_PATTERNS) {
    if (pattern.test(ctx.commandText)) {
      // Check if there's an explicit cap
      const hasCap = CAP_PATTERNS.some(cap => cap.test(ctx.commandText));
      if (!hasCap) {
        return `Unbounded resource amplification: ${ctx.commandText.slice(0, 80)}`;
      }
    }
  }
  return null;
}

// ─── STAGE 2: THREE-AXIS SCORING ───────────────────────────────────────────

const PROTECTED_PATHS = /~\/Desktop|\/Users\/\w+\/Desktop|~\/Documents|\/Users\/\w+\/Documents/;
const SENSITIVE_PATHS = /\.(ssh|env|zshrc|bashrc|profile|gitconfig)|\/etc\/|authorized_keys|id_rsa|\.gnupg/;
const TEMP_PATHS = /\/tmp\/|\/var\/tmp\/|\.tmp$|\.temp$/;
const SAFE_COMMANDS = /^(ls|cat|head|tail|pwd|whoami|hostname|uptime|date|df|du|ps|echo|which|file|wc|id|uname|sw_vers|system_profiler|defaults\s+read|printenv|env|set|type|man|help)\b/;
const DESTRUCTIVE_COMMANDS = /^(rm|kill|killall)\b/;
const STATE_MODIFYING_COMMANDS = /^(mkdir|cp|mv|touch|ln)\b/;
const COMPOUND_OPERATORS = /[;|&`]|\$\(/;

function scoreIrreversibility(ctx: ActionContext): { value: 0 | 1 | 2 | 3; reason: string } {
  // Read-only actions
  if (ctx.actionType === 'file_read' || ctx.actionType === 'system_info' || ctx.actionType === 'net_dns') {
    return { value: 0, reason: 'Read-only operation' };
  }

  // Exec: safe commands are 0, state-modifying are 2, destructive are 3
  if (ctx.actionType === 'exec') {
    if (SAFE_COMMANDS.test(ctx.commandText) && !COMPOUND_OPERATORS.test(ctx.commandText)) {
      return { value: 0, reason: 'Safe read-only command' };
    }
    if (DESTRUCTIVE_COMMANDS.test(ctx.commandText)) {
      return { value: 3, reason: `Destructive command: ${ctx.commandText.match(DESTRUCTIVE_COMMANDS)?.[0]}` };
    }
    if (STATE_MODIFYING_COMMANDS.test(ctx.commandText)) {
      return { value: 2, reason: 'State-modifying command' };
    }
    return { value: 2, reason: 'Unknown command — conservative' };
  }

  // File operations
  if (ctx.actionType === 'file_delete') {
    return { value: 3, reason: 'File deletion is permanent' };
  }
  if (ctx.actionType === 'file_move') {
    return { value: 2, reason: 'File move changes filesystem state' };
  }
  if (ctx.actionType === 'file_write') {
    return { value: 2, reason: 'File write overwrites existing content' };
  }

  // Network
  if (ctx.actionType === 'net_request') {
    return { value: 2, reason: 'Network request sends data externally' };
  }

  return { value: 2, reason: 'Unknown action type — conservative' };
}

function scoreConsequence(ctx: ActionContext): { value: 0 | 1 | 2 | 3; reason: string } {
  const target = ctx.targetPath;

  // Temp files = low consequence
  if (TEMP_PATHS.test(target)) {
    return { value: 0, reason: 'Temporary file — low consequence' };
  }

  // Protected paths = high consequence
  if (PROTECTED_PATHS.test(target)) {
    return { value: 3, reason: 'Protected path (Desktop/Documents)' };
  }

  // Sensitive config = high consequence
  if (SENSITIVE_PATHS.test(target)) {
    return { value: 3, reason: 'Sensitive config file' };
  }

  // System config
  if (/^\/etc\//.test(target) || /\/Library\//.test(target)) {
    return { value: 3, reason: 'System configuration' };
  }

  // Exec: look at what the command targets
  if (ctx.actionType === 'exec') {
    if (PROTECTED_PATHS.test(ctx.commandText)) {
      return { value: 3, reason: 'Command targets protected path' };
    }
    if (SENSITIVE_PATHS.test(ctx.commandText)) {
      return { value: 3, reason: 'Command targets sensitive file' };
    }
    if (SAFE_COMMANDS.test(ctx.commandText) && !COMPOUND_OPERATORS.test(ctx.commandText)) {
      return { value: 0, reason: 'Safe read-only command' };
    }
    return { value: 1, reason: 'Standard command' };
  }

  // Default for file operations in project directories
  return { value: 1, reason: 'Project file' };
}

function scoreBlastRadius(ctx: ActionContext): { value: 0 | 1 | 2 | 3; reason: string } {
  // Read-only = no blast
  if (ctx.actionType === 'file_read' || ctx.actionType === 'system_info' || ctx.actionType === 'net_dns') {
    return { value: 0, reason: 'Read-only — no blast radius' };
  }

  // Network requests affect external systems
  if (ctx.actionType === 'net_request') {
    return { value: 3, reason: 'Affects external systems' };
  }

  // Exec: check for recursive/broad operations
  if (ctx.actionType === 'exec') {
    if (SAFE_COMMANDS.test(ctx.commandText) && !COMPOUND_OPERATORS.test(ctx.commandText)) {
      return { value: 0, reason: 'Read-only command' };
    }
    // Recursive flags
    if (/\s-[rR]f?\s|\s-rf\s|\s--recursive\b/.test(ctx.commandText)) {
      return { value: 2, reason: 'Recursive operation — affects directory tree' };
    }
    // Compound commands increase blast radius
    if (COMPOUND_OPERATORS.test(ctx.commandText)) {
      return { value: 2, reason: 'Compound command — multiple operations' };
    }
    return { value: 1, reason: 'Single command — localized effect' };
  }

  // Single file operations
  if (ctx.actionType === 'file_write' || ctx.actionType === 'file_delete' || ctx.actionType === 'file_move') {
    return { value: 0, reason: 'Single file operation' };
  }

  return { value: 1, reason: 'Unknown — conservative' };
}

// ─── MAIN CLASSIFIER ───────────────────────────────────────────────────────

export function classifyAction(ctx: ActionContext): ClassificationResult {
  // === STAGE 1: Boundedness check ===
  // If any condition is true, consequence is unbounded → Tier 4

  const trustBoundary = checkCrossesTrustBoundary(ctx);
  if (trustBoundary) {
    return {
      tier: 4,
      bounded: false,
      detailLevel: 'full',
      unboundedReason: 'crosses_trust_boundary',
      explanation: trustBoundary,
    };
  }

  const enforcement = checkModifiesEnforcement(ctx);
  if (enforcement) {
    return {
      tier: 4,
      bounded: false,
      detailLevel: 'full',
      unboundedReason: 'modifies_enforcement_layer',
      explanation: enforcement,
    };
  }

  const privileges = checkGrantsPrivileges(ctx);
  if (privileges) {
    return {
      tier: 4,
      bounded: false,
      detailLevel: 'full',
      unboundedReason: 'grants_privileges',
      explanation: privileges,
    };
  }

  const replicates = checkSelfReplicates(ctx);
  if (replicates) {
    return {
      tier: 4,
      bounded: false,
      detailLevel: 'full',
      unboundedReason: 'self_replicates',
      explanation: replicates,
    };
  }

  const amplification = checkResourceAmplification(ctx);
  if (amplification) {
    return {
      tier: 4,
      bounded: false,
      detailLevel: 'full',
      unboundedReason: 'unbounded_resource_amplification',
      explanation: amplification,
    };
  }

  // === STAGE 2: Three-axis scoring for bounded actions ===

  const i = scoreIrreversibility(ctx);
  const c = scoreConsequence(ctx);
  const b = scoreBlastRadius(ctx);
  const risk = Math.max(i.value, c.value, b.value) as 0 | 1 | 2 | 3;

  let tier: 0 | 1 | 2 | 3;
  if (risk >= 3) tier = 3;
  else if (risk >= 2) tier = 2;
  else if (risk >= 1) tier = 1;
  else tier = 0;

  // Build explanation
  const dominant = risk === i.value ? 'irreversibility' : risk === c.value ? 'consequence' : 'blast radius';
  const explanation = tier <= 1
    ? (i.reason !== c.reason ? `${i.reason}; ${c.reason}` : i.reason)
    : `${dominant}: ${risk === i.value ? i.reason : risk === c.value ? c.reason : b.reason}`;

  return {
    tier,
    bounded: true,
    detailLevel: tier <= 1 ? 'lite' : 'full',
    scores: {
      irreversibility: i,
      consequence: c,
      blastRadius: b,
    },
    explanation,
  };
}

/**
 * Map a ClassificationResult to the existing green/yellow/red system.
 * This preserves backward compatibility with the current Telegram UX.
 *
 * Tier 0-1 → green (auto-approve, silent notification)
 * Tier 2   → yellow (one-step approve/deny)
 * Tier 3-4 → red (two-step review flow)
 */
export function tierToRiskLevel(tier: 0 | 1 | 2 | 3 | 4): 'green' | 'yellow' | 'red' {
  if (tier <= 1) return 'green';
  if (tier === 2) return 'yellow';
  return 'red';
}

/**
 * Build ActionContext from hooks data.
 */
export function buildActionContext(
  description: string,
  params: Record<string, unknown>
): ActionContext {
  let actionType = 'exec';
  let targetPath = '';
  let commandText = '';

  if (description.includes('/exec')) {
    actionType = 'exec';
    commandText = String(params.command || '');
  } else if (description.includes('/file/delete')) {
    actionType = 'file_delete';
    targetPath = String(params.path || '');
  } else if (description.includes('/file/write')) {
    actionType = 'file_write';
    targetPath = String(params.path || '');
  } else if (description.includes('/file/move')) {
    actionType = 'file_move';
    targetPath = String(params.source || params.path || '');
  } else if (description.includes('/file/read')) {
    actionType = 'file_read';
    targetPath = String(params.path || '');
  } else if (description.includes('/net/request')) {
    actionType = 'net_request';
    targetPath = String(params.url || '');
  } else if (description.includes('/net/dns')) {
    actionType = 'net_dns';
    targetPath = String(params.hostname || '');
  } else if (description.includes('/system/info')) {
    actionType = 'system_info';
  }

  return {
    actionType,
    targetPath,
    commandText,
    description,
    params,
  };
}
