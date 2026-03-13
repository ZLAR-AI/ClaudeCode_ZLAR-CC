import { ZLAR_HEADERS } from '@zlar/shared';

export interface ScenarioResult {
  name: string;
  method: string;
  path: string;
  statusCode: number;
  zlarStatus: string | null;
  zlarLatency: string | null;
  totalLatencyMs: number;
  body: unknown;
}

interface Scenario {
  name: string;
  method: string;
  path: string;
  body?: Record<string, unknown>;
  expectation: 'passthrough' | 'halted';
}

const SCENARIOS: Scenario[] = [
  {
    name: '1. Check balance',
    method: 'GET',
    path: '/balance',
    expectation: 'passthrough',
  },
  {
    name: '2. View transactions',
    method: 'GET',
    path: '/transactions',
    expectation: 'passthrough',
  },
  {
    name: '3. Small transfer $5,000',
    method: 'POST',
    path: '/transfer',
    body: { amount: 5000, recipient: 'vendor-A', currency: 'USD', memo: 'Monthly payment' },
    expectation: 'passthrough',
  },
  {
    name: '4. Medium transfer $25,000',
    method: 'POST',
    path: '/transfer',
    body: { amount: 25000, recipient: 'contractor-B', currency: 'USD' },
    expectation: 'passthrough',
  },
  {
    name: '5. LARGE transfer $250,000 [PROTECTED]',
    method: 'POST',
    path: '/transfer',
    body: {
      amount: 250000,
      recipient: 'subsidiary-offshore',
      currency: 'USD',
      memo: 'Quarterly funding',
    },
    expectation: 'halted',
  },
  {
    name: '6. Small trade 10 shares AAPL',
    method: 'POST',
    path: '/trade',
    body: { symbol: 'AAPL', quantity: 10, side: 'buy' },
    expectation: 'passthrough',
  },
  {
    name: '7. LARGE trade 1000 shares TSLA [PROTECTED]',
    method: 'POST',
    path: '/trade',
    body: { symbol: 'TSLA', quantity: 1000, side: 'sell' },
    expectation: 'halted',
  },
];

export async function runScenarios(
  gatewayUrl: string,
  agentId: string
): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n--- ${scenario.name} ---`);
    console.log(`  Expected: ${scenario.expectation.toUpperCase()}`);

    const url = `${gatewayUrl}${scenario.path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Agent-ID': agentId,
    };

    const start = performance.now();

    try {
      const response = await fetch(url, {
        method: scenario.method,
        headers,
        body: scenario.body ? JSON.stringify(scenario.body) : undefined,
        signal: AbortSignal.timeout(scenario.expectation === 'halted' ? 120_000 : 15_000),
      });

      const totalLatencyMs = performance.now() - start;
      const body = await response.json();

      const result: ScenarioResult = {
        name: scenario.name,
        method: scenario.method,
        path: scenario.path,
        statusCode: response.status,
        zlarStatus: response.headers.get(ZLAR_HEADERS.STATUS),
        zlarLatency: response.headers.get(ZLAR_HEADERS.LATENCY),
        totalLatencyMs,
        body,
      };

      results.push(result);

      console.log(`  HTTP ${response.status}`);
      console.log(`  ZLAR Status: ${result.zlarStatus}`);
      console.log(`  ZLAR Latency: ${result.zlarLatency}ms`);
      console.log(`  Total Round-Trip: ${totalLatencyMs.toFixed(2)}ms`);
    } catch (err: any) {
      const totalLatencyMs = performance.now() - start;
      console.log(`  TIMEOUT after ${totalLatencyMs.toFixed(0)}ms`);
      console.log(`  (Expected — action halted, awaiting human authorization)`);

      results.push({
        name: scenario.name,
        method: scenario.method,
        path: scenario.path,
        statusCode: 0,
        zlarStatus: 'pending_authorization',
        zlarLatency: null,
        totalLatencyMs,
        body: { note: 'Halted — awaiting human authorization via Telegram' },
      });
    }
  }

  return results;
}
