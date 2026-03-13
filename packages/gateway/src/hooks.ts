import { Router } from 'express';
import { PolicyConfig, AuditEntry, createAuditLogger } from '@zlar/shared';
import { ActionMatcher } from './matcher';
import { PendingStore } from './pending-store';
import { TelegramNotifier } from './telegram';
import { classifyAction, buildActionContext, tierToRiskLevel } from './classifier';

interface HooksOptions {
  matcher: ActionMatcher;
  pendingStore: PendingStore;
  telegram: TelegramNotifier | null;
  policy: PolicyConfig;
  auditLogger: ReturnType<typeof createAuditLogger>;
}

interface ClaudeCodeHookInput {
  session_id: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id?: string;
  cwd?: string;
}

/**
 * Translate a Claude Code tool call into the internal method+path+body
 * format that the policy matcher understands.
 */
function translateToolCall(toolName: string, toolInput: Record<string, unknown>): {
  method: string;
  path: string;
  body: Record<string, unknown>;
  description: string;
} | null {
  switch (toolName) {
    case 'Bash':
      return {
        method: 'POST',
        path: '/exec',
        body: { command: toolInput.command, cwd: toolInput.cwd },
        description: 'POST /exec',
      };

    case 'Write':
      return {
        method: 'POST',
        path: '/file/write',
        body: { path: toolInput.file_path, content: toolInput.content },
        description: 'POST /file/write',
      };

    case 'Edit':
      return {
        method: 'POST',
        path: '/file/write',
        body: {
          path: toolInput.file_path,
          content: `${toolInput.old_string} → ${toolInput.new_string}`,
        },
        description: 'POST /file/write',
      };

    case 'Read':
      return {
        method: 'GET',
        path: '/file/read',
        body: { path: toolInput.file_path },
        description: 'GET /file/read',
      };

    // Read-only tools — pass through like Read
    // Without explicit mapping these hit default deny and silently break Claude Code
    case 'Glob':
      return {
        method: 'GET',
        path: '/file/read',
        body: { path: toolInput.pattern || '' },
        description: 'GET /file/read',
      };

    case 'Grep':
      return {
        method: 'GET',
        path: '/file/read',
        body: { path: toolInput.path || '' },
        description: 'GET /file/read',
      };

    // NotebookEdit modifies files — gate it like Write
    case 'NotebookEdit':
      return {
        method: 'POST',
        path: '/file/write',
        body: { path: toolInput.notebook_path, content: toolInput.new_source || '' },
        description: 'POST /file/write',
      };

    // Agent/Task spawns subprocesses — gate it like exec
    case 'Task':
      return {
        method: 'POST',
        path: '/exec',
        body: { command: `[Agent] ${toolInput.prompt || toolInput.description || 'subagent'}` },
        description: 'POST /exec',
      };

    // Network tools — exfiltration risk, gate through outbound
    case 'WebFetch':
      return {
        method: 'POST',
        path: '/net/request',
        body: { url: toolInput.url, method: 'GET' },
        description: 'POST /net/request',
      };

    case 'WebSearch':
      return {
        method: 'POST',
        path: '/net/request',
        body: { url: `search: ${toolInput.query}`, method: 'GET' },
        description: 'POST /net/request',
      };

    default:
      return null;
  }
}

export function createHooksRouter(options: HooksOptions): Router {
  const { matcher, pendingStore, telegram, policy, auditLogger } = options;
  const router = Router();

  router.post('/pre-tool-use', async (req, res) => {
    const input = req.body as ClaudeCodeHookInput;
    const { tool_name, tool_input, session_id } = input;

    console.log(`[ZLAR:HOOK] ${tool_name} — ${JSON.stringify(tool_input).slice(0, 100)}`);

    // Translate to internal format
    const translated = translateToolCall(tool_name, tool_input || {});

    if (!translated) {
      // Unknown tool — check default action
      const defaultAction = policy.settings.defaultAction || 'deny';
      if (defaultAction === 'deny') {
        console.log(`[ZLAR:HOOK] DEFAULT DENY: unknown tool "${tool_name}"`);
        res.json({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `ZLAR: Unknown tool "${tool_name}" — default deny.`,
          },
        });
        return;
      }
      // Default pass — let Claude Code handle normally
      res.json({});
      return;
    }

    const { method, path, body, description } = translated;

    // Run through policy matcher
    const matchResult = matcher.match(method, path, body);

    // === NO MATCH — DEFAULT DENY ===
    if (!matchResult.matched) {
      const defaultAction = policy.settings.defaultAction || 'deny';
      if (defaultAction === 'deny') {
        console.log(`[ZLAR:HOOK] DEFAULT DENY: ${tool_name} → ${method} ${path}`);

        auditLogger.log({
          timestamp: new Date().toISOString(),
          actionId: `hook-${Date.now()}`,
          type: 'denied',
          method,
          path,
          agentId: `claude-code:${session_id || 'unknown'}`,
          ruleId: null,
          latencyMs: 0,
        } satisfies AuditEntry);

        res.json({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: `ZLAR: No policy rule for ${method} ${path}. Default: deny.`,
          },
        });
        return;
      }
      // Default pass
      res.json({});
      return;
    }

    const rule = matchResult.rule!;

    // === PASS — allow without dialog ===
    if (rule.action === 'pass') {
      console.log(`[ZLAR:HOOK] PASS: ${tool_name} → rule ${rule.id}`);

      auditLogger.log({
        timestamp: new Date().toISOString(),
        actionId: `hook-${Date.now()}`,
        type: 'passthrough',
        method,
        path,
        agentId: `claude-code:${session_id || 'unknown'}`,
        ruleId: rule.id,
        latencyMs: 0,
      } satisfies AuditEntry);

      res.json({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      });
      return;
    }

    // === PROTECT — classify risk ===
    const displayParams = extractHookParams(tool_name, tool_input);
    const actionCtx = buildActionContext(description, displayParams);
    const classification = classifyAction(actionCtx);
    const riskLevel = tierToRiskLevel(classification.tier);
    console.log(`[ZLAR:CLASSIFY] ${tool_name} → Tier ${classification.tier} (${riskLevel}) — ${classification.explanation}`);

    // === GREEN — auto-approve, silent notification ===
    if (riskLevel === 'green') {
      console.log(`[ZLAR:HOOK] GREEN AUTO-APPROVE: ${tool_name} → rule ${rule.id}`);

      auditLogger.log({
        timestamp: new Date().toISOString(),
        actionId: `hook-${Date.now()}`,
        type: 'authorized',
        method,
        path,
        agentId: `claude-code:${session_id || 'unknown'}`,
        ruleId: rule.id,
        params: displayParams,
        latencyMs: 0,
        authorizer: 'system:green-auto',
      } satisfies AuditEntry);

      // Silent notification — no buttons
      if (telegram && rule.authorizers) {
        telegram.notifySilent(description, displayParams, rule.authorizers, new Map());
      }

      res.json({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      });
      return;
    }

    // === YELLOW / RED — full Telegram approval flow ===
    // Timeout scales with risk: yellow = 1 hour, red = 24 hours (effectively "wait forever")
    const TIMEOUT_BY_RISK: Record<string, number> = {
      yellow: 60 * 60 * 1000,       // 1 hour
      red:    24 * 60 * 60 * 1000,  // 24 hours
    };
    const timeoutMs = TIMEOUT_BY_RISK[riskLevel] || rule.timeout || policy.settings.authorizationTimeoutMs;
    console.log(`[ZLAR:HOOK] HALT (${riskLevel}): ${tool_name} → rule ${rule.id} — awaiting Telegram (timeout: ${Math.round(timeoutMs / 60000)}min)`);

    const { id: pendingId, promise } = pendingStore.create(
      {
        ruleId: rule.id,
        timestamp: Date.now(),
        method,
        path,
        headers: {},
        body: null,
        agentId: `claude-code:${session_id || 'unknown'}`,
        params: displayParams,
        riskLevel,  // persisted to SQLite for /pending display
      } as any,
      timeoutMs
    );

    // Audit the halt
    auditLogger.log({
      timestamp: new Date().toISOString(),
      actionId: pendingId,
      type: 'halted',
      method,
      path,
      agentId: `claude-code:${session_id || 'unknown'}`,
      ruleId: rule.id,
      params: displayParams,
      latencyMs: 0,
    } satisfies AuditEntry);

    // Send Telegram notification
    if (telegram && rule.authorizers) {
      await telegram.notifyAuthorizers(
        pendingId,
        rule.id,
        description,
        displayParams,
        rule.authorizers,
        riskLevel as 'yellow' | 'red'
      );
    } else {
      console.warn(`[ZLAR:HOOK] No Telegram or no authorizers — action will timeout`);
    }

    // Wait for human decision
    const haltedAt = Date.now();
    const decision = await promise;
    const latencyMs = Date.now() - haltedAt;

    if (decision.action === 'authorize') {
      console.log(`[ZLAR:HOOK] AUTHORIZED by ${decision.authorizer} — ${tool_name}`);

      auditLogger.log({
        timestamp: new Date().toISOString(),
        actionId: pendingId,
        type: 'authorized',
        method,
        path,
        agentId: `claude-code:${session_id || 'unknown'}`,
        ruleId: rule.id,
        params: displayParams,
        latencyMs,
        authorizer: decision.authorizer,
      } satisfies AuditEntry);

      res.json({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      });
      return;
    }

    // Denied or timeout
    const reason = decision.authorizer === 'system:timeout' ? 'timeout' : 'denied';
    console.log(`[ZLAR:HOOK] DENIED (${reason}) — ${tool_name}`);

    // Update Telegram message on timeout so stale buttons don't linger
    if (reason === 'timeout' && telegram) {
      await telegram.onTimeout(pendingId);
    }

    auditLogger.log({
      timestamp: new Date().toISOString(),
      actionId: pendingId,
      type: reason === 'timeout' ? 'timeout' : 'denied',
      method,
      path,
      agentId: `claude-code:${session_id || 'unknown'}`,
      ruleId: rule.id,
      params: displayParams,
      latencyMs,
      authorizer: decision.authorizer,
    } satisfies AuditEntry);

    res.json({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason === 'timeout'
          ? `ZLAR: Authorization timed out (${timeoutMs / 1000}s). Action blocked.`
          : `ZLAR: Denied by ${decision.authorizer}.`,
      },
    });
  });

  return router;
}

function extractHookParams(toolName: string, toolInput: Record<string, unknown>): Record<string, unknown> {
  switch (toolName) {
    case 'Bash':
      return {
        command: toolInput.command,
        ...(toolInput.cwd ? { cwd: toolInput.cwd } : {}),
      };
    case 'Write':
      return {
        path: toolInput.file_path,
        content: toolInput.content,
      };
    case 'Edit':
      return {
        path: toolInput.file_path,
        content: `Edit: "${String(toolInput.old_string || '').slice(0, 40)}" → "${String(toolInput.new_string || '').slice(0, 40)}"`,
      };
    case 'Read':
    case 'Glob':
    case 'Grep':
      return { path: toolInput.file_path || toolInput.pattern || toolInput.path || '' };
    case 'NotebookEdit':
      return {
        path: toolInput.notebook_path,
        content: String(toolInput.new_source || '').slice(0, 100),
      };
    case 'Task':
      return {
        command: `[Agent] ${String(toolInput.prompt || toolInput.description || 'subagent').slice(0, 100)}`,
      };
    case 'WebFetch':
      return { url: toolInput.url, method: 'GET' };
    case 'WebSearch':
      return { url: `search: ${toolInput.query}`, method: 'GET' };
    default:
      return toolInput;
  }
}
