import { createCashfreeOrder, getCashfreeConfig } from './lib/cashfree.js';
import { transactionStore } from './lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  try {
    const { 
      amount, 
      currency = 'INR', 
      receipt, 
      notes = {}, 
      customer = {}, 
      returnUrl = null 
    } = req.body || {};

    if (!amount || typeof amount !== 'number' || amount <= 0) {
      res.statusCode = 400;
      return res.json({ error: 'Invalid or missing amount. Must be a positive number in INR.' });
    }

    const config = getCashfreeConfig();
    const orderId = receipt || `order_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const orderData = await createCashfreeOrder({
      orderId,
      orderAmount: amount,
      orderCurrency: currency,
      customer: {
        id: customer.id || `cust_${Date.now()}`,
        name: customer.name || 'LUXORA Patron',
        email: customer.email || 'guest@luxora.atelier',
        phone: customer.phone || '9999999999'
      },
      returnUrl,
      notes: {
        ...notes,
        merchant: config.merchantName,
        createdVia: 'LUXORA Cashfree Gateway'
      }
    });

    // Record order in backend store
    transactionStore.saveOrder({
      id: orderData.orderId,
      cfOrderId: orderData.cfOrderId,
      amountInRupees: amount,
      currency: orderData.orderCurrency || currency,
      receipt: orderId,
      status: 'created',
      paymentSessionId: orderData.paymentSessionId,
      notes,
      items: notes.items || [],
      customer
    });

    res.statusCode = 200;
    return res.json({
      success: true,
      orderId: orderData.orderId,
      cfOrderId: orderData.cfOrderId,
      paymentSessionId: orderData.paymentSessionId,
      amount: orderData.orderAmount,
      currency: orderData.orderCurrency,
      appId: config.appId,
      merchantName: config.merchantName,
      env: config.env,
      isSimulator: orderData.isSimulator
    });
  } catch (error) {
    console.error('[Create Cashfree Order Error]:', error);
    res.statusCode = 500;
    return res.json({
      success: false,
      error: error.message || 'Failed to create Cashfree payment order'
    });
  }
}
