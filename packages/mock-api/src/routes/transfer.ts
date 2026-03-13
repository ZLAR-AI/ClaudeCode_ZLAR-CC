import { Router } from 'express';
import { randomUUID } from 'node:crypto';

export const transferRouter = Router();

transferRouter.post('/', (req, res) => {
  const { amount, recipient, currency = 'USD', memo } = req.body;

  if (!amount || !recipient) {
    res.status(400).json({ error: 'Missing required fields: amount, recipient' });
    return;
  }

  // Simulate processing delay (50-150ms)
  const delay = 50 + Math.random() * 100;
  setTimeout(() => {
    res.json({
      transactionId: randomUUID(),
      status: 'completed',
      amount: Number(amount),
      currency,
      recipient,
      memo: memo || null,
      timestamp: new Date().toISOString(),
      fee: Number(amount) * 0.001,
    });
  }, delay);
});
