import { Router } from 'express';
import { randomUUID } from 'node:crypto';

export const tradeRouter = Router();

const MOCK_PRICES: Record<string, number> = {
  AAPL: 187.50, GOOGL: 141.80, MSFT: 415.20,
  AMZN: 178.90, TSLA: 245.60,
};

tradeRouter.post('/', (req, res) => {
  const { symbol, quantity, side, type = 'market' } = req.body;

  if (!symbol || !quantity || !side) {
    res.status(400).json({ error: 'Missing required fields: symbol, quantity, side' });
    return;
  }

  const price = MOCK_PRICES[symbol.toUpperCase()] || 100.00;
  const totalValue = price * Number(quantity);

  const delay = 50 + Math.random() * 100;
  setTimeout(() => {
    res.json({
      orderId: randomUUID(),
      status: 'filled',
      symbol: symbol.toUpperCase(),
      side,
      type,
      quantity: Number(quantity),
      pricePerShare: price,
      totalValue,
      commission: totalValue * 0.0005,
      timestamp: new Date().toISOString(),
    });
  }, delay);
});
