import { Response } from 'express';
import { ZLAR_HEADERS } from '@zlar/shared';

export function setZlarHeaders(
  res: Response,
  data: {
    actionId: string;
    status: string;
    rule: string;
    latencyMs: number;
    policyName: string;
  }
): void {
  res.set(ZLAR_HEADERS.ACTION_ID, data.actionId);
  res.set(ZLAR_HEADERS.STATUS, data.status);
  res.set(ZLAR_HEADERS.RULE, data.rule);
  res.set(ZLAR_HEADERS.LATENCY, String(data.latencyMs.toFixed(3)));
  res.set(ZLAR_HEADERS.POLICY, data.policyName);
  res.set(ZLAR_HEADERS.TIMESTAMP, new Date().toISOString());
}
