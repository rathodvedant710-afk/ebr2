import { transactionStore } from './lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  const { id } = req.query || {};

  if (id) {
    const tx = transactionStore.getTransactionById(id);
    if (!tx) {
      res.statusCode = 404;
      return res.json({ error: 'Transaction not found' });
    }
    res.statusCode = 200;
    return res.json({ success: true, transaction: tx });
  }

  const all = transactionStore.getAllTransactions(50);
  res.statusCode = 200;
  return res.json({ success: true, transactions: all });
}
