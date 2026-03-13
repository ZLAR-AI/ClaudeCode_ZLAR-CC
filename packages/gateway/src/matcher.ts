import { PolicyRule, MatchCondition } from '@zlar/shared';

export interface MatchResult {
  matched: boolean;
  rule: PolicyRule | null;
}

export interface ActionMatcher {
  match(method: string, path: string, body?: Record<string, unknown>): MatchResult;
}

export function createActionMatcher(rules: PolicyRule[]): ActionMatcher {
  // Pre-build Map keyed by "METHOD:PATH" for O(1) lookup
  const index = new Map<string, PolicyRule[]>();

  for (const rule of rules) {
    const key = `${rule.match.method.toUpperCase()}:${rule.match.path}`;
    const existing = index.get(key) || [];
    existing.push(rule);
    index.set(key, existing);
  }

  return {
    match(method: string, path: string, body?: Record<string, unknown>): MatchResult {
      const key = `${method.toUpperCase()}:${path}`;
      const candidates = index.get(key);

      if (!candidates || candidates.length === 0) {
        return { matched: false, rule: null };
      }

      for (const rule of candidates) {
        if (!rule.match.conditions || rule.match.conditions.length === 0) {
          return { matched: true, rule };
        }
        if (body && evaluateConditions(rule.match.conditions, body)) {
          return { matched: true, rule };
        }
      }

      return { matched: false, rule: null };
    }
  };
}

function evaluateConditions(
  conditions: MatchCondition[],
  body: Record<string, unknown>
): boolean {
  return conditions.every((cond) => {
    const value = getNestedValue(body, cond.field);
    if (value === undefined) return false;

    switch (cond.operator) {
      case 'gt':  return Number(value) > Number(cond.value);
      case 'lt':  return Number(value) < Number(cond.value);
      case 'gte': return Number(value) >= Number(cond.value);
      case 'lte': return Number(value) <= Number(cond.value);
      case 'eq':         return value === cond.value;
      case 'neq':        return value !== cond.value;
      case 'contains':   return typeof value === 'string' && typeof cond.value === 'string' && value.includes(cond.value);
      case 'startsWith': return typeof value === 'string' && typeof cond.value === 'string' && value.startsWith(cond.value);
      default:           return false;
    }
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current: any, key) => current?.[key], obj);
}
