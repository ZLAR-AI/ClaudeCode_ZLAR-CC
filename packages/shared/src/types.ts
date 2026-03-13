// === Policy Configuration Types ===

export interface PolicyConfig {
  version: string;
  name: string;
  target: TargetConfig;
  authorizers: Authorizer[];
  rules: PolicyRule[];
  settings: PolicySettings;
}

export interface TargetConfig {
  baseUrl: string;
}

export interface Authorizer {
  id: string;
  name: string;
  role: string;
  telegramChatId: string;
}

export interface PolicyRule {
  id: string;
  description: string;
  match: RequestMatcher;
  action: 'protect' | 'pass';
  authorizers?: string[];
  timeout?: number;
}

export interface RequestMatcher {
  method: string;
  path: string;
  conditions?: MatchCondition[];
}

export interface MatchCondition {
  field: string;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq' | 'contains' | 'startsWith';
  value: number | string;
}

export interface PolicySettings {
  defaultAction: 'pass' | 'deny';
  authorizationTimeoutMs: number;
  auditLogPath: string;
}

// === Runtime Types ===

export interface PendingAction {
  id: string;
  ruleId: string;
  timestamp: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Buffer | null;
  agentId: string;
  params: Record<string, unknown>;
  resolve: (decision: AuthorizationDecision) => void;
  timeoutHandle: NodeJS.Timeout;
}

export interface AuthorizationDecision {
  action: 'authorize' | 'deny';
  authorizer: string;
  timestamp: number;
  signature?: string;
}

// === Response Types ===

export interface ZlarHaltResponse {
  zlar: {
    status: 'pending_authorization';
    actionId: string;
    rule: string;
    message: string;
    timeoutMs: number;
  };
}

export interface ZlarDenyResponse {
  zlar: {
    status: 'denied';
    actionId: string;
    rule: string;
    reason: 'timeout' | 'denied_by_authorizer' | 'policy_violation';
    message: string;
  };
}

// === Audit Log Types ===

export interface AuditEntry {
  timestamp: string;
  actionId: string;
  type: 'passthrough' | 'halted' | 'authorized' | 'denied' | 'timeout';
  method: string;
  path: string;
  agentId: string;
  ruleId: string | null;
  params?: Record<string, unknown>;
  latencyMs: number;
  authorizer?: string;
}

// === Classification Types ===

export interface ClassificationResult {
  tier: 0 | 1 | 2 | 3 | 4;
  bounded: boolean;
  detailLevel: 'lite' | 'full';

  // Stage 1: which unbounded condition triggered (if any)
  unboundedReason?:
    | 'crosses_trust_boundary'
    | 'modifies_enforcement_layer'
    | 'grants_privileges'
    | 'self_replicates'
    | 'unbounded_resource_amplification';

  // Stage 2: three-axis scores (only present for bounded actions)
  scores?: {
    irreversibility: { value: 0 | 1 | 2 | 3; reason: string };
    consequence:     { value: 0 | 1 | 2 | 3; reason: string };
    blastRadius:     { value: 0 | 1 | 2 | 3; reason: string };
  };

  // Human-readable explanation — always present
  explanation: string;
}

// === ZLAR Header Constants ===

export const ZLAR_HEADERS = {
  ACTION_ID: 'X-ZLAR-Action-ID',
  STATUS: 'X-ZLAR-Status',
  RULE: 'X-ZLAR-Rule',
  LATENCY: 'X-ZLAR-Latency-Ms',
  POLICY: 'X-ZLAR-Policy',
  TIMESTAMP: 'X-ZLAR-Timestamp',
} as const;
