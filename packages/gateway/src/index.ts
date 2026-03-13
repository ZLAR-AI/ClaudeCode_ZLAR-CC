import * as path from 'node:path';
import * as fs from 'node:fs';
import * as net from 'node:net';
import { loadPolicyFromFile, loadAndVerifyPolicy } from '@zlar/shared';
import { createGatewayServer } from './server';

function rotateAuditLog(logPath: string): void {
  if (!fs.existsSync(logPath)) return;

  const stats = fs.statSync(logPath);
  if (stats.size === 0) return;

  const dir = path.dirname(logPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archived = path.join(dir, `zlar-audit-${timestamp}.ndjson`);
  fs.renameSync(logPath, archived);
  console.log(`[ZLAR] Archived previous audit log → ${path.basename(archived)}`);
}

function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(500);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => { resolve(false); });
  });
}

async function main() {
  const policyPath = process.env.POLICY_PATH || path.resolve(__dirname, '../../../config/policy.yaml');
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || '';
  const port = Number(process.env.GATEWAY_PORT || 3000);

  console.log('[ZLAR] Loading policy:', policyPath);

  // Try signature-verified loading first
  const sigPath = policyPath + '.sig';
  const pubKeyPath = path.resolve(path.dirname(policyPath), 'keys/zlar-public.key');
  let policy;
  let verified = false;

  if (fs.existsSync(sigPath) && fs.existsSync(pubKeyPath)) {
    const pubKeyHex = fs.readFileSync(pubKeyPath, 'utf8').trim();
    try {
      policy = loadAndVerifyPolicy(policyPath, sigPath, pubKeyHex);
      verified = true;
      console.log(`[ZLAR] Policy "${policy.name}" loaded — ${policy.rules.length} rules — SIGNATURE VERIFIED`);
    } catch (err: any) {
      console.error(`[ZLAR] SIGNATURE VERIFICATION FAILED: ${err.message}`);
      console.error('[ZLAR] Refusing to start with tampered policy.');
      process.exit(1);
    }
  } else if (process.env.ALLOW_UNSIGNED_POLICY === 'true') {
    policy = loadPolicyFromFile(policyPath);
    console.warn('[ZLAR] ⚠️  =======================================');
    console.warn('[ZLAR] ⚠️  RUNNING WITH UNSIGNED POLICY');
    console.warn('[ZLAR] ⚠️  Policy integrity is NOT verified.');
    console.warn('[ZLAR] ⚠️  For development use only.');
    console.warn('[ZLAR] ⚠️  =======================================');
    console.warn(`[ZLAR] Policy "${policy.name}" loaded — ${policy.rules.length} rules — UNSIGNED`);
  } else {
    console.error('[ZLAR] REFUSING TO START: No policy signature found.');
    console.error(`[ZLAR] Expected: ${sigPath}`);
    console.error(`[ZLAR] Expected: ${pubKeyPath}`);
    console.error('[ZLAR] To sign: npx tsx packages/tools/src/index.ts sign config/policy-mac.yaml config/keys/zlar-private.key');
    console.error('[ZLAR] To bypass (dev only): ALLOW_UNSIGNED_POLICY=true');
    process.exit(1);
  }

  if (!telegramToken) {
    console.warn('[ZLAR] TELEGRAM_BOT_TOKEN not set — halted actions will timeout without notification');
  }

  // Check if gateway port is already in use
  if (await checkPort(port)) {
    console.error(`[ZLAR] Port ${port} is already in use. Kill the existing process and try again.`);
    process.exit(1);
  }

  // Check if target API is reachable
  const targetUrl = new URL(policy.target.baseUrl);
  const targetPort = Number(targetUrl.port) || 80;
  if (!(await checkPort(targetPort))) {
    console.warn(`[ZLAR] Warning: Target API on port ${targetPort} is not reachable. Start mock-api first.`);
  }

  // Rotate audit log so each demo starts fresh
  const auditLogPath = path.resolve(
    path.dirname(policyPath), '..',
    policy.settings.auditLogPath || './audit-log/zlar-audit.ndjson'
  );
  rotateAuditLog(auditLogPath);

  const { server } = await createGatewayServer({ policy, telegramToken });

  server.listen(port, () => {
    console.log(`[ZLAR] Gateway running on port ${port}`);
    console.log(`[ZLAR] Proxying to ${policy.target.baseUrl}`);
    console.log('[ZLAR] The gate has no intelligence. That is the point.');
  });
}

main().catch((err) => {
  console.error('[ZLAR] Fatal:', err);
  process.exit(1);
});
