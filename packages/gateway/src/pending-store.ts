import { PendingAction, AuthorizationDecision } from '@zlar/shared';
import { randomUUID } from 'node:crypto';

export interface PendingStore {
  create(
    actionData: Omit<PendingAction, 'id' | 'resolve' | 'timeoutHandle'>,
    timeoutMs: number
  ): { id: string; promise: Promise<AuthorizationDecision> };
  resolve(id: string, decision: AuthorizationDecision): boolean;
  get(id: string): PendingAction | undefined;
  entries(): IterableIterator<[string, PendingAction]>;
  size(): number;
}

export function createPendingStore(): PendingStore {
  const store = new Map<string, PendingAction>();

  return {
    create(actionData, timeoutMs) {
      const id = randomUUID();
      let resolvePromise!: (decision: AuthorizationDecision) => void;

      const promise = new Promise<AuthorizationDecision>((resolve) => {
        resolvePromise = resolve;
      });

      const timeoutHandle = setTimeout(() => {
        const pending = store.get(id);
        if (pending) {
          pending.resolve({
            action: 'deny',
            authorizer: 'system:timeout',
            timestamp: Date.now(),
          });
          store.delete(id);
        }
      }, timeoutMs);

      const entry: PendingAction = {
        ...actionData,
        id,
        resolve: resolvePromise,
        timeoutHandle,
      };

      store.set(id, entry);
      return { id, promise };
    },

    resolve(id: string, decision: AuthorizationDecision): boolean {
      const pending = store.get(id);
      if (!pending) return false;

      clearTimeout(pending.timeoutHandle);
      pending.resolve(decision);
      store.delete(id);
      return true;
    },

    get(id: string) {
      return store.get(id);
    },

    entries() {
      return store.entries();
    },

    size() {
      return store.size;
    },
  };
}
