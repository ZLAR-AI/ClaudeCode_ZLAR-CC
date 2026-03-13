import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { PendingAction, AuthorizationDecision } from '@zlar/shared';
import { randomUUID } from 'node:crypto';
import { PendingStore } from './pending-store';

// === SQLite row shape ===
interface PendingRow {
  id: string;
  rule_id: string;
  timestamp: number;
  method: string;
  path: string;
  agent_id: string;
  params: string;       // JSON string
  risk_level: string | null;
  status: string;        // 'pending' | 'deferred' | 'resolved'
  decision: string | null;
  decided_by: string | null;
  decided_at: number | null;
  timeout_ms: number;
}

// Runtime state that can't be serialized to SQLite
interface RuntimeEntry {
  resolve: (decision: AuthorizationDecision) => void;
  timeoutHandle: NodeJS.Timeout;
  pendingAction: PendingAction;
}

export interface SqlitePendingStore extends PendingStore {
  /** Reload pending entries from SQLite on startup. Returns count of restored entries. */
  restore(onTimeout: (id: string) => Promise<void>): number;
  /** Get all pending/deferred rows for /pending display */
  getPendingRows(): PendingRow[];
  /** Close the database */
  close(): void;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  params TEXT NOT NULL,
  risk_level TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  decision TEXT,
  decided_by TEXT,
  decided_at INTEGER,
  timeout_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_actions(status);
`;

export function createSqlitePendingStore(dbPath?: string): SqlitePendingStore {
  // Default to data/ directory in project root
  const resolvedPath = dbPath || path.resolve(__dirname, '../../../data/zlar-pending.db');
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');  // Write-ahead logging for crash safety
  db.pragma('busy_timeout = 5000');
  db.exec(SCHEMA);

  // Runtime state — in-memory only (Promise resolvers, timeout handles)
  const runtime = new Map<string, RuntimeEntry>();

  // Prepared statements for performance
  const insertStmt = db.prepare(`
    INSERT INTO pending_actions (id, rule_id, timestamp, method, path, agent_id, params, risk_level, status, timeout_ms)
    VALUES (@id, @rule_id, @timestamp, @method, @path, @agent_id, @params, @risk_level, 'pending', @timeout_ms)
  `);

  const resolveStmt = db.prepare(`
    UPDATE pending_actions
    SET status = 'resolved', decision = @decision, decided_by = @decided_by, decided_at = @decided_at
    WHERE id = @id AND status = 'pending'
  `);

  const deferStmt = db.prepare(`
    UPDATE pending_actions
    SET status = 'deferred', decision = 'deny', decided_by = 'system:timeout', decided_at = @decided_at
    WHERE id = @id AND status = 'pending'
  `);

  const getStmt = db.prepare(`SELECT * FROM pending_actions WHERE id = ?`);

  const pendingRowsStmt = db.prepare(`
    SELECT * FROM pending_actions WHERE status IN ('pending', 'deferred') ORDER BY timestamp DESC
  `);

  const countStmt = db.prepare(`SELECT COUNT(*) as count FROM pending_actions WHERE status = 'pending'`);

  const loadPendingStmt = db.prepare(`SELECT * FROM pending_actions WHERE status = 'pending'`);

  return {
    create(actionData, timeoutMs) {
      const id = randomUUID();
      let resolvePromise!: (decision: AuthorizationDecision) => void;

      const promise = new Promise<AuthorizationDecision>((resolve) => {
        resolvePromise = resolve;
      });

      // Persist to SQLite first (crash-safe)
      insertStmt.run({
        id,
        rule_id: actionData.ruleId,
        timestamp: actionData.timestamp,
        method: actionData.method,
        path: actionData.path,
        agent_id: actionData.agentId,
        params: JSON.stringify(actionData.params),
        risk_level: (actionData as any).riskLevel || null,
        timeout_ms: timeoutMs,
      });

      const timeoutHandle = setTimeout(() => {
        const entry = runtime.get(id);
        if (entry) {
          // Update SQLite: pending → deferred
          deferStmt.run({ id, decided_at: Date.now() });

          entry.resolve({
            action: 'deny',
            authorizer: 'system:timeout',
            timestamp: Date.now(),
          });
          runtime.delete(id);
        }
      }, timeoutMs);

      const pendingAction: PendingAction = {
        ...actionData,
        id,
        resolve: resolvePromise,
        timeoutHandle,
      };

      runtime.set(id, { resolve: resolvePromise, timeoutHandle, pendingAction });

      return { id, promise };
    },

    resolve(id: string, decision: AuthorizationDecision): boolean {
      const entry = runtime.get(id);
      if (!entry) return false;

      clearTimeout(entry.timeoutHandle);

      // Update SQLite: pending → resolved
      resolveStmt.run({
        id,
        decision: decision.action,
        decided_by: decision.authorizer,
        decided_at: decision.timestamp,
      });

      entry.resolve(decision);
      runtime.delete(id);
      return true;
    },

    get(id: string): PendingAction | undefined {
      const entry = runtime.get(id);
      return entry?.pendingAction;
    },

    entries(): IterableIterator<[string, PendingAction]> {
      const result = new Map<string, PendingAction>();
      for (const [id, entry] of runtime) {
        result.set(id, entry.pendingAction);
      }
      return result.entries();
    },

    size(): number {
      // Count from runtime (active pending actions)
      return runtime.size;
    },

    getPendingRows(): PendingRow[] {
      return pendingRowsStmt.all() as PendingRow[];
    },

    restore(onTimeout: (id: string) => Promise<void>): number {
      const rows = loadPendingStmt.all() as PendingRow[];
      let restored = 0;

      for (const row of rows) {
        const elapsed = Date.now() - row.timestamp;
        const remaining = row.timeout_ms - elapsed;

        if (remaining <= 0) {
          // Already expired while gateway was down — mark as deferred
          deferStmt.run({ id: row.id, decided_at: Date.now() });
          console.log(`[ZLAR:DB] Expired while down: ${row.id} (${row.method} ${row.path})`);
          continue;
        }

        // Recreate in-memory state with a new Promise
        let resolvePromise!: (decision: AuthorizationDecision) => void;
        const promise = new Promise<AuthorizationDecision>((resolve) => {
          resolvePromise = resolve;
        });

        const timeoutHandle = setTimeout(() => {
          const entry = runtime.get(row.id);
          if (entry) {
            deferStmt.run({ id: row.id, decided_at: Date.now() });
            entry.resolve({
              action: 'deny',
              authorizer: 'system:timeout',
              timestamp: Date.now(),
            });
            runtime.delete(row.id);
            onTimeout(row.id).catch(() => {});
          }
        }, remaining);

        const params = JSON.parse(row.params);

        const pendingAction: PendingAction = {
          id: row.id,
          ruleId: row.rule_id,
          timestamp: row.timestamp,
          method: row.method,
          path: row.path,
          headers: {},
          body: null,
          agentId: row.agent_id,
          params,
          resolve: resolvePromise,
          timeoutHandle,
        };

        runtime.set(row.id, { resolve: resolvePromise, timeoutHandle, pendingAction });
        restored++;

        const remainingMin = Math.round(remaining / 60000);
        console.log(`[ZLAR:DB] Restored: ${row.id} (${row.method} ${row.path}) — ${remainingMin}min remaining`);
      }

      return restored;
    },

    close() {
      db.close();
    },
  };
}
