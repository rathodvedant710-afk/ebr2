import { verifyCashfreeWebhookSignature } from './lib/cashfree.js';
import { transactionStore } from './lib/store.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  try {
    const signature = 
      req.headers['x-webhook-signature'] || 
      req.headers['x-webhook-signature'.toLowerCase()];
    const timestamp = 
      req.headers['x-webhook-timestamp'] || 
      req.headers['x-webhook-timestamp'.toLowerCase()];

    const eventPayload = req.body || {};

    // Verify Cashfree webhook signature
    const { valid, isSimulator, error } = verifyCashfreeWebhookSignature({
      rawBody: req.rawBody || eventPayload,
      signature,
      timestamp
    });

    if (!valid && !isSimulator) {
      console.warn('[Cashfree Webhook] Invalid webhook signature');
      res.statusCode = 400;
      return res.json({ error: 'Invalid Cashfree webhook signature', details: error });
    }

    const eventType = eventPayload.type || eventPayload.event;
    console.log(`[Cashfree Webhook] Received event: ${eventType}`);

    const orderData = eventPayload.data?.order;
    const paymentData = eventPayload.data?.payment;
    const customerData = eventPayload.data?.customer_details;

    if (eventType === 'PAYMENT_SUCCESS_WEBHOOK' || eventType === 'payment.captured') {
      const orderId = orderData?.order_id;
      const paymentId = paymentData?.cf_payment_id || `cf_pay_${Date.now()}`;

      transactionStore.updateTransactionStatus(paymentId, 'captured', {
        orderId,
        amount: paymentData?.payment_amount || orderData?.order_amount,
        method: paymentData?.payment_method ? JSON.stringify(paymentData.payment_method) : 'Cashfree',
        email: customerData?.customer_email,
        phone: customerData?.customer_phone,
        capturedAt: new Date().toISOString()
      });
    } else if (eventType === 'PAYMENT_FAILED_WEBHOOK' || eventType === 'payment.failed') {
      const orderId = orderData?.order_id;
      const paymentId = paymentData?.cf_payment_id || `cf_fail_${Date.now()}`;

      transactionStore.updateTransactionStatus(paymentId, 'failed', {
        orderId,
        errorReason: paymentData?.payment_message || 'Payment failed on Cashfree',
        failedAt: new Date().toISOString()
      });
    } else if (eventType === 'ORDER_PAID_WEBHOOK' || eventType === 'order.paid') {
      const orderId = orderData?.order_id;
      if (orderId) {
        const existingOrder = transactionStore.getOrder(orderId);
        if (existingOrder) {
          existingOrder.status = 'paid';
          existingOrder.paidAt = new Date().toISOString();
        }
      }
    }

    res.statusCode = 200;
    return res.json({ status: 'ok', received: true, eventType });
  } catch (error) {
    console.error('[Cashfree Webhook Error]:', error);
    res.statusCode = 500;
    return res.json({ error: 'Cashfree webhook processing failure', message: error.message });
  }
}
