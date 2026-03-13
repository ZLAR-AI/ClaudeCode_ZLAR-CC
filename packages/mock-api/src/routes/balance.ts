import { Router } from 'express';

export const balanceRouter = Router();

balanceRouter.get('/', (_req, res) => {
  res.json({
    accountId: 'ACCT-001',
    balances: {
      USD: 1_250_000.00,
      EUR: 340_000.00,
      GBP: 125_000.00,
    },
    availableForTrading: 980_000.00,
    pendingTransfers: 15_000.00,
    timestamp: new Date().toISOString(),
  });
});
