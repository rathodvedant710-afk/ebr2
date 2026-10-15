import fs from 'fs';
import path from 'path';

// In-memory cache for fast lookups and serverless environments
const inMemoryTransactions = new Map();
const inMemoryOrders = new Map();
const inFlightLocks = new Set();

const DATA_DIR = path.resolve(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'transactions.json');

// Attempt to load persisted records in persistent environments
function initDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (Array.isArray(data.transactions)) {
        data.transactions.forEach(tx => inMemoryTransactions.set(tx.id, tx));
      }
      if (Array.isArray(data.orders)) {
        data.orders.forEach(ord => inMemoryOrders.set(ord.id, ord));
      }
    }
  } catch (err) {
    console.warn('[Store] Could not load persisted data, using in-memory store:', err.message);
  }
}

initDb();

function persistDb() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      transactions: Array.from(inMemoryTransactions.values()),
      orders: Array.from(inMemoryOrders.values()),
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    // Graceful fallback for serverless read-only filesystems
    console.warn('[Store] Skipping file persistence (serverless/read-only):', err.message);
  }
}

export const transactionStore = {
  // Save or update an order
  saveOrder(order) {
    const record = {
      ...order,
      status: order.status || 'created',
      createdAt: order.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    inMemoryOrders.set(order.id, record);
    persistDb();
    return record;
  },

  getOrder(orderId) {
    return inMemoryOrders.get(orderId) || null;
  },

  // Lock for duplicate prevention during payment verification
  acquireLock(key) {
    if (inFlightLocks.has(key)) {
      return false; // already processing
    }
    inFlightLocks.add(key);
    return true;
  },

  releaseLock(key) {
    inFlightLocks.delete(key);
  },

  // Check if payment was already processed
  hasPayment(paymentId) {
    for (const tx of inMemoryTransactions.values()) {
      if (tx.paymentId === paymentId && tx.status === 'captured') {
        return true;
      }
    }
    return false;
  },

  isOrderPaid(orderId) {
    if (!orderId) return false;
    const ord = inMemoryOrders.get(orderId);
    if (ord && ord.status === 'paid') return true;
    for (const tx of inMemoryTransactions.values()) {
      if (tx.orderId === orderId && tx.status === 'captured') {
        return true;
      }
    }
    return false;
  },

  getTransactionByOrderId(orderId) {
    if (!orderId) return null;
    for (const tx of inMemoryTransactions.values()) {
      if (tx.orderId === orderId && tx.status === 'captured') {
        return tx;
      }
    }
    for (const tx of inMemoryTransactions.values()) {
      if (tx.orderId === orderId) {
        return tx;
      }
    }
    return null;
  },

  getPayment(paymentId) {
    let fallback = null;
    for (const tx of inMemoryTransactions.values()) {
      if (tx.paymentId === paymentId) {
        if (tx.status === 'captured') {
          return tx;
        }
        fallback = tx;
      }
    }
    return fallback;
  },

  // Record a verified transaction
  saveTransaction(txData) {
    const id = txData.id || `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const record = {
      id,
      ...txData,
      createdAt: txData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    inMemoryTransactions.set(id, record);

    // Update corresponding order status if exists
    if (record.orderId && inMemoryOrders.has(record.orderId)) {
      const ord = inMemoryOrders.get(record.orderId);
      ord.status = record.status === 'captured' ? 'paid' : record.status;
      ord.paymentId = record.paymentId;
      ord.updatedAt = new Date().toISOString();
      inMemoryOrders.set(record.orderId, ord);
    }

    persistDb();
    return record;
  },

  updateTransactionStatus(paymentId, status, details = {}) {
    for (const [id, tx] of inMemoryTransactions.entries()) {
      if (tx.paymentId === paymentId || tx.orderId === details.orderId) {
        const updated = {
          ...tx,
          status,
          ...details,
          updatedAt: new Date().toISOString()
        };
        inMemoryTransactions.set(id, updated);
        persistDb();
        return updated;
      }
    }
    return null;
  },

  getAllTransactions(limit = 50) {
    return Array.from(inMemoryTransactions.values())
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  },

  getTransactionById(id) {
    return inMemoryTransactions.get(id) || null;
  }
};
