import express from 'express';
import { transferRouter } from './routes/transfer';
import { tradeRouter } from './routes/trade';
import { balanceRouter } from './routes/balance';
import { transactionsRouter } from './routes/transactions';

const app = express();
app.use(express.json());

app.use('/transfer', transferRouter);
app.use('/trade', tradeRouter);
app.use('/balance', balanceRouter);
app.use('/transactions', transactionsRouter);

const PORT = process.env.MOCK_API_PORT || 4000;
app.listen(PORT, () => {
  console.log(`Mock Financial API running on port ${PORT}`);
});
