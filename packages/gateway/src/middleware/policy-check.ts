import { Request, Response, NextFunction } from 'express';
import { PolicyConfig, AuditEntry, ZlarDenyResponse } from '@zlar/shared';
import { ActionMatcher } from '../matcher';
import { PendingStore } from '../pending-store';
import { TelegramNotifier } from '../telegram';
import { ProxyHandler } from '../proxy';
import { getElapsedMs } from './timing';
import { setZlarHeaders } from '../headers';
import { randomUUID } from 'node:crypto';

interface PolicyCheckOptions {
  matcher: ActionMatcher;
  pendingStore: PendingStore;
  telegram: TelegramNotifier | null;
  proxyHandler: ProxyHandler;
  policy: PolicyConfig;
}

export function createPolicyCheckMiddleware(options: PolicyCheckOptions) {
  const { matcher, pendingStore, telegram, proxyHandler, policy } = options;

  return async (req: Request, res: Response, _next: NextFunction) => {
    const actionId = randomUUID();
    const method = req.method;
    const path = req.path;
    const body = req.body || {};
    const agentId = (req.headers['x-agent-id'] as string) || req.ip || 'unknown';

    // === MATCH ===
    const matchResult = matcher.match(method, path, body);

    // === DEFAULT DENY: unmatched requests are blocked ===
    if (!matchResult.matched) {
      const defaultAction = policy.settings.defaultAction || 'deny';
      if (defaultAction === 'deny') {
        console.log(`[ZLAR] DEFAULT DENY: ${method} ${path} — no matching rule`);

        const latencyMs = getElapsedMs(req);
        (res as any).__zlar_audit_entry = {
          timestamp: new Date().toISOString(),
          actionId,
          type: 'denied',
          method,
          path,
          agentId,
          ruleId: null,
          latencyMs,
        } satisfies AuditEntry;

        setZlarHeaders(res, {
          actionId,
          status: 'denied',
          rule: 'default-deny',
          latencyMs,
          policyName: policy.name,
        });

        const denyResponse: ZlarDenyResponse = {
          zlar: {
            status: 'denied',
            actionId,
            rule: 'default-deny',
            reason: 'policy_violation',
            message: `No matching policy rule for ${method} ${path}. Default action: deny.`,
          },
        };

        res.status(403).json(denyResponse);
        return;
      }
      // defaultAction === 'pass' falls through to passthrough below
    }

    // === PASSTHROUGH PATH ===
    if (!matchResult.matched || matchResult.rule?.action === 'pass') {
      const latencyMs = getElapsedMs(req);

      // Inject ZLAR headers before proxy writes its response
      const originalWriteHead = res.writeHead.bind(res);
      (res as any).writeHead = function (statusCode: number, ...args: any[]) {
        setZlarHeaders(res, {
          actionId,
          status: 'passthrough',
          rule: matchResult.rule?.id || 'none',
          latencyMs: getElapsedMs(req),
          policyName: policy.name,
        });
        return originalWriteHead(statusCode, ...args);
      };

      // Audit entry
      (res as any).__zlar_audit_entry = {
        timestamp: new Date().toISOString(),
        actionId,
        type: 'passthrough',
        method,
        path,
        agentId,
        ruleId: matchResult.rule?.id || null,
        latencyMs,
      } satisfies AuditEntry;

      // Forward to target
      proxyHandler.forward(req, res);
      return;
    }

    // === HALT PATH ===
    const rule = matchResult.rule!;
    const timeoutMs = rule.timeout || policy.settings.authorizationTimeoutMs;

    console.log(`[ZLAR] HALT: ${method} ${path} — Rule: ${rule.id} — Awaiting authorization`);

    // Create pending action
    const { id: pendingId, promise } = pendingStore.create(
      {
        ruleId: rule.id,
        timestamp: Date.now(),
        method,
        path,
        headers: req.headers as Record<string, string>,
        body: (req as any).rawBody || null,
        agentId,
        params: extractDisplayParams(body),
      },
      timeoutMs
    );

    // Notify via Telegram
    if (telegram && rule.authorizers) {
      await telegram.notifyAuthorizers(
        pendingId,
        rule.id,
        `${method} ${path}`,
        extractDisplayParams(body),
        rule.authorizers
      );
    } else {
      console.warn(`[ZLAR] No Telegram or no authorizers — action ${pendingId} will timeout`);
    }

    // Audit the halt
    (res as any).__zlar_audit_entry = {
      timestamp: new Date().toISOString(),
      actionId: pendingId,
      type: 'halted',
      method,
      path,
      agentId,
      ruleId: rule.id,
      params: extractDisplayParams(body),
      latencyMs: getElapsedMs(req),
    } satisfies AuditEntry;

    // === WAIT FOR DECISION ===
    const decision = await promise;

    if (decision.action === 'authorize') {
      console.log(`[ZLAR] AUTHORIZED by ${decision.authorizer} — releasing ${method} ${path}`);

      // Update audit
      (res as any).__zlar_audit_entry = {
        timestamp: new Date().toISOString(),
        actionId: pendingId,
        type: 'authorized',
        method,
        path,
        agentId,
        ruleId: rule.id,
        params: extractDisplayParams(body),
        latencyMs: getElapsedMs(req),
        authorizer: decision.authorizer,
      } satisfies AuditEntry;

      // Inject headers and forward
      const originalWriteHead = res.writeHead.bind(res);
      (res as any).writeHead = function (statusCode: number, ...args: any[]) {
        setZlarHeaders(res, {
          actionId: pendingId,
          status: 'authorized',
          rule: rule.id,
          latencyMs: getElapsedMs(req),
          policyName: policy.name,
        });
        return originalWriteHead(statusCode, ...args);
      };

      proxyHandler.forward(req, res);
      return;
    }

    // === DENIED or TIMEOUT ===
    const reason = decision.authorizer === 'system:timeout' ? 'timeout' : 'denied_by_authorizer';
    console.log(`[ZLAR] DENIED (${reason}) — ${method} ${path}`);

    if (reason === 'timeout' && telegram) {
      await telegram.onTimeout(pendingId);
    }

    (res as any).__zlar_audit_entry = {
      timestamp: new Date().toISOString(),
      actionId: pendingId,
      type: reason === 'timeout' ? 'timeout' : 'denied',
      method,
      path,
      agentId,
      ruleId: rule.id,
      params: extractDisplayParams(body),
      latencyMs: getElapsedMs(req),
      authorizer: decision.authorizer,
    } satisfies AuditEntry;

    setZlarHeaders(res, {
      actionId: pendingId,
      status: 'denied',
      rule: rule.id,
      latencyMs: getElapsedMs(req),
      policyName: policy.name,
    });

    const denyResponse: ZlarDenyResponse = {
      zlar: {
        status: 'denied',
        actionId: pendingId,
        rule: rule.id,
        reason,
        message:
          reason === 'timeout'
            ? `Authorization timed out after ${timeoutMs}ms`
            : `Action denied by ${decision.authorizer}`,
      },
    };

    res.status(403).json(denyResponse);
  };
}

function extractDisplayParams(body: Record<string, unknown>): Record<string, unknown> {
  const interesting = ['amount', 'recipient', 'currency', 'symbol', 'quantity', 'side', 'type', 'memo', 'command', 'args', 'cwd', 'path', 'content', 'source', 'destination', 'url', 'method', 'headers', 'body', 'hostname'];
  const result: Record<string, unknown> = {};
  for (const key of interesting) {
    if (body[key] !== undefined) {
      result[key] = body[key];
    }
  }
  return result;
}
