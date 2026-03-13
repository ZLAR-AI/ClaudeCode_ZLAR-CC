import express from 'express';
import http from 'node:http';
import { PolicyConfig, createAuditLogger } from '@zlar/shared';
import { createProxyHandler } from './proxy';
import { createActionMatcher } from './matcher';
import { createSqlitePendingStore } from './pending-store-sqlite';
import { createTelegramNotifier, TelegramNotifier } from './telegram';
import { timingMiddleware } from './middleware/timing';
import { createPolicyCheckMiddleware } from './middleware/policy-check';
import { createAuditMiddleware } from './middleware/audit';
import { createHooksRouter } from './hooks';

export interface GatewayOptions {
  policy: PolicyConfig;
  telegramToken: string;
}

export async function createGatewayServer(options: GatewayOptions) {
  const { policy, telegramToken } = options;

  const app = express();

  // Parse JSON body but keep raw buffer for proxying
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  // Create subsystems
  const matcher = createActionMatcher(policy.rules);
  const pendingStore = createSqlitePendingStore();
  const auditLogger = createAuditLogger(
    policy.settings.auditLogPath || './audit-log/zlar-audit.ndjson'
  );
  const proxyHandler = createProxyHandler(policy.target.baseUrl, process.env.ZLAR_API_SECRET);

  let telegram: TelegramNotifier | null = null;
  if (telegramToken) {
    telegram = createTelegramNotifier(telegramToken, policy.authorizers, pendingStore);
    console.log('[ZLAR] Telegram bot connected');

    // Restore pending actions from SQLite (crash recovery)
    const restored = pendingStore.restore(async (id) => {
      await telegram!.onTimeout(id);
    });
    if (restored > 0) {
      console.log(`[ZLAR] Restored ${restored} pending action(s) from database`);
    }
  }

  // Claude Code hooks endpoint — mounted before proxy middleware
  app.use('/hooks', createHooksRouter({
    matcher,
    pendingStore,
    telegram,
    policy,
    auditLogger,
  }));

  // Middleware pipeline
  app.use(timingMiddleware());
  app.use(createAuditMiddleware(auditLogger));
  app.use(
    createPolicyCheckMiddleware({
      matcher,
      pendingStore,
      telegram,
      proxyHandler,
      policy,
    })
  );

  const server = http.createServer(app);

  // Graceful shutdown — close SQLite
  const cleanup = () => {
    pendingStore.close();
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  return { app, server };
}
