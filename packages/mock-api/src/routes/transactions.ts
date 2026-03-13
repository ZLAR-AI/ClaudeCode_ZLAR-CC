import { Router } from 'express';
import { randomUUID } from 'node:crypto';

export const transactionsRouter = Router();

transactionsRouter.get('/', (_req, res) => {
  const now = Date.now();
  const transactions = [
    {
      id: randomUUID(), type: 'transfer', amount: 5000, currency: 'USD',
      recipient: 'vendor-A', status: 'completed',
      timestamp: new Date(now - 3_600_000).toISOString(),
    },
    {
      id: randomUUID(), type: 'trade', symbol: 'AAPL', quantity: 50, side: 'buy',
      totalValue: 9375, status: 'filled',
      timestamp: new Date(now - 7_200_000).toISOString(),
    },
    {
      id: randomUUID(), type: 'transfer', amount: 250_000, currency: 'USD',
      recipient: 'subsidiary-B', status: 'completed',
      timestamp: new Date(now - 86_400_000).toISOString(),
    },
  ];

  res.json({ transactions, count: transactions.length });
});
