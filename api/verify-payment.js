import { verifyCashfreePayment } from './lib/cashfree.js';
import { transactionStore } from './lib/store.js';

// Coalesce concurrent verification requests for the same order into a single promise
const inFlightVerifications = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  try {
    const {
      orderId,
      paymentId,
      paymentMethod = 'cashfree',
      orderDetails = {},
      customer = {}
    } = req.body || {};

    if (!orderId) {
      res.statusCode = 400;
      return res.json({
        success: false,
        error: 'Missing required parameter: orderId is required for Cashfree verification.'
      });
    }

    // 1. DUPLICATE PAYMENT CHECK / IDEMPOTENCY
    // If order was already marked paid or payment was captured, return existing success immediately
    if (transactionStore.isOrderPaid(orderId)) {
      const existingTx = transactionStore.getTransactionByOrderId(orderId);
      return res.json({
        success: true,
        verified: true,
        alreadyProcessed: true,
        message: 'Payment has already been verified and recorded.',
        transaction: existingTx,
        orderId,
        paymentId: existingTx?.paymentId || paymentId
      });
    }

    if (paymentId && transactionStore.hasPayment(paymentId)) {
      const existingTx = transactionStore.getPayment(paymentId);
      return res.json({
        success: true,
        verified: true,
        alreadyProcessed: true,
        message: 'Payment has already been verified and recorded.',
        transaction: existingTx,
        orderId,
        paymentId
      });
    }

    // 2. IN-FLIGHT DEDUPLICATION
    // If another request is currently verifying this exact order, await the existing verification
    if (inFlightVerifications.has(orderId)) {
      try {
        const result = await inFlightVerifications.get(orderId);
        res.statusCode = result.status;
        return res.json(result.body);
      } catch (err) {
        // If the in-flight failed, proceed to fresh verification
      }
    }

    // 3. EXECUTE VERIFICATION WORK (Wrapped in promise for coalescing)
    const verificationPromise = (async () => {
      const verification = await verifyCashfreePayment({
        orderId,
        paymentId
      });

      if (!verification.valid) {
        // If order is still ACTIVE (waiting for user to scan / enter PIN), return pending status
        if (verification.orderStatus === 'ACTIVE') {
          return {
            status: 200,
            body: {
              success: true,
              verified: false,
              status: 'pending',
              message: 'Payment is currently in progress. Waiting for confirmation.'
            }
          };
        }

        // Only record failed attempt if order is confirmed failed/cancelled/terminated
        if (['TERMINATED', 'EXPIRED', 'FAILED', 'CANCELLED'].includes(verification.orderStatus)) {
          transactionStore.saveTransaction({
            orderId,
            paymentId: verification.paymentId || paymentId || 'unassigned',
            status: 'failed',
            error: verification.error || 'Cashfree payment verification failed',
            customer,
            paymentMethod
          });
        }

        return {
          status: 400,
          body: {
            success: false,
            verified: false,
            error: verification.error || 'Cashfree payment could not be confirmed as successful.'
          }
        };
      }

      // 4. RETRIEVE ASSOCIATED ORDER & RECORD SUCCESSFUL TRANSACTION
      const existingOrder = transactionStore.getOrder(orderId);
      const amount = orderDetails.amount || (existingOrder ? existingOrder.amountInRupees : 0);
      const currency = orderDetails.currency || (existingOrder ? existingOrder.currency : 'INR');
      const resolvedPaymentId = verification.paymentId || paymentId || `cf_pay_${Date.now()}`;

      const transaction = transactionStore.saveTransaction({
        orderId,
        paymentId: resolvedPaymentId,
        status: 'captured',
        amount,
        currency,
        paymentMethod: `Cashfree (${paymentMethod})`,
        customer,
        isSimulator: verification.isSimulator,
        paymentDetails: verification.paymentDetails,
        items: orderDetails.items || (existingOrder ? existingOrder.items : []),
        shippingAddress: orderDetails.shippingAddress || null,
        notes: orderDetails.notes || {}
      });

      return {
        status: 200,
        body: {
          success: true,
          verified: true,
          isSimulator: verification.isSimulator,
          paymentId: resolvedPaymentId,
          orderId,
          message: 'Payment verified and captured successfully via Cashfree',
          transaction
        }
      };
    })();

    inFlightVerifications.set(orderId, verificationPromise);

    try {
      const result = await verificationPromise;
      res.statusCode = result.status;
      return res.json(result.body);
    } finally {
      inFlightVerifications.delete(orderId);
    }
  } catch (error) {
    console.error('[Verify Cashfree Payment Error]:', error);
    res.statusCode = 500;
    return res.json({
      success: false,
      error: error.message || 'Internal server error verifying Cashfree payment'
    });
  }
}
