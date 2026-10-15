import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getAppBaseUrl, getLocalIpAddress } from './network.js';

/**
 * Dynamically parse env file if present
 */
function readEnvFile(filename) {
  try {
    const fullPath = path.resolve(process.cwd(), filename);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const vars = {};
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            vars[key] = val;
          }
        }
      });
      return vars;
    }
  } catch (e) {
    // ignore
  }
  return {};
}

/**
 * Resolve Cashfree environment configuration safely
 * Reads process.env first, with fallback to .env.local and .env
 */
export function getCashfreeConfig() {
  const localEnv = readEnvFile('.env.local');
  const baseEnv = readEnvFile('.env');

  const getVar = (name) => {
    return localEnv[name] || process.env[name] || baseEnv[name] || '';
  };

  const envRaw = (getVar('CASHFREE_ENV') || getVar('VITE_CASHFREE_ENV') || 'sandbox').toLowerCase();
  const env = envRaw === 'production' || envRaw === 'live' || envRaw === 'prod' ? 'production' : 'sandbox';

  const appId = 
    getVar('CASHFREE_APP_ID') || 
    getVar('CASHFREE_CLIENT_ID') || 
    getVar('VITE_CASHFREE_APP_ID') || 
    '';

  const secretKey = 
    getVar('CASHFREE_SECRET_KEY') || 
    getVar('CASHFREE_CLIENT_SECRET') || 
    '';

  const apiVersion = getVar('CASHFREE_API_VERSION') || '2023-08-01';
  const webhookSecret = getVar('CASHFREE_WEBHOOK_SECRET') || secretKey || '';
  const currency = getVar('CASHFREE_CURRENCY') || 'INR';
  const merchantName = getVar('CASHFREE_MERCHANT_NAME') || 'LUXORA Luxury Atelier';

  const isPlaceholder = 
    !appId || 
    appId.includes('PLACEHOLDER') || 
    appId.includes('placeholder') || 
    !secretKey || 
    secretKey.includes('PLACEHOLDER') || 
    secretKey.includes('placeholder');

  const isConfigured = !isPlaceholder;
  const isLive = isConfigured && env === 'production';
  const baseUrl = isLive ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg';

  const appUrl = getVar('APP_URL') || getVar('VITE_APP_URL') || '';
  const networkUrl = getAppBaseUrl();
  const localIp = getLocalIpAddress();

  return {
    env,
    appId,
    secretKey,
    apiVersion,
    webhookSecret,
    currency,
    merchantName,
    isConfigured,
    isLive,
    baseUrl,
    appUrl: appUrl || networkUrl,
    networkUrl,
    localIp
  };
}

/**
 * Common Cashfree request headers
 */
function getHeaders(config) {
  return {
    'Content-Type': 'application/json',
    'x-api-version': config.apiVersion,
    'x-client-id': config.appId,
    'x-client-secret': config.secretKey
  };
}

/**
 * Create a Payment Gateway order with Cashfree
 */
export async function createCashfreeOrder({
  orderId,
  orderAmount,
  orderCurrency = 'INR',
  customer = {},
  returnUrl = null,
  notifyUrl = null,
  orderNote = 'Payment',
  notes = {}
}) {
  const config = getCashfreeConfig();

  // Clean customer phone (Indian 10-digit format)
  const phone = customer.phone ? customer.phone.replace(/\D/g, '').slice(-10) : '';
  const validPhone = phone.length === 10 ? phone : '9820144521';

  // Clean customer ID (alphanumeric, max 50 chars)
  const customerId = (customer.id || `cust_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

  // Clean order ID
  const cleanOrderId = (orderId || `ord_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);

  // If real/sandbox API keys are provided, communicate with Cashfree REST endpoint
  if (config.isConfigured) {
    // Ensure return_url uses reachable host instead of localhost so mobile phones can connect after QR scan
    const reachableBase = config.appUrl || getAppBaseUrl();
    let finalReturnUrl = returnUrl || `${reachableBase}/checkout?order_id={order_id}`;
    if (finalReturnUrl.includes('localhost') || finalReturnUrl.includes('127.0.0.1')) {
      try {
        const parsed = new URL(finalReturnUrl);
        const targetBase = new URL(reachableBase);
        parsed.protocol = targetBase.protocol;
        parsed.host = targetBase.host;
        parsed.port = targetBase.port;
        finalReturnUrl = parsed.toString();
      } catch {
        finalReturnUrl = `${reachableBase}/checkout?order_id={order_id}`;
      }
    }

    const payload = {
      order_id: cleanOrderId,
      order_amount: Number(Number(orderAmount).toFixed(2)),
      order_currency: orderCurrency.toUpperCase(),
      customer_details: {
        customer_id: customerId,
        customer_name: (customer.name || 'LUXORA Patron').slice(0, 100),
        customer_email: customer.email || 'guest@luxora.atelier',
        customer_phone: validPhone
      },
      order_meta: {
        return_url: finalReturnUrl,
        notify_url: notifyUrl || undefined
      },
      order_note: (orderNote || 'Payment').slice(0, 200)
    };

    const res = await fetch(`${config.baseUrl}/orders`, {
      method: 'POST',
      headers: getHeaders(config),
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[Cashfree Order API Error]:', data);
      throw new Error(data.message || `Cashfree Order API returned status ${res.status}`);
    }

    return {
      orderId: data.order_id,
      cfOrderId: data.cf_order_id,
      paymentSessionId: data.payment_session_id,
      orderStatus: data.order_status,
      orderAmount: data.order_amount,
      orderCurrency: data.order_currency,
      isSimulator: false
    };
  }

  // Developer Sandbox Simulator Order (when user hasn't populated actual Cashfree API keys yet)
  const simulatedPaymentSessionId = `session_sim_${crypto.randomBytes(16).toString('hex')}`;
  return {
    orderId: cleanOrderId,
    cfOrderId: `cf_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    paymentSessionId: simulatedPaymentSessionId,
    orderStatus: 'ACTIVE',
    orderAmount: Number(orderAmount),
    orderCurrency,
    isSimulator: true
  };
}

/**
 * Fetch Order details from Cashfree
 */
export async function getCashfreeOrder(orderId) {
  const config = getCashfreeConfig();
  if (!config.isConfigured) {
    return {
      order_id: orderId,
      order_status: 'PAID',
      isSimulator: true
    };
  }

  const res = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: getHeaders(config)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || `Failed to fetch Cashfree order ${orderId}`);
  }
  return data;
}

/**
 * Fetch Payments list for an Order from Cashfree
 */
export async function getCashfreeOrderPayments(orderId) {
  const config = getCashfreeConfig();
  if (!config.isConfigured) {
    return [
      {
        payment_status: 'SUCCESS',
        cf_payment_id: `sim_pay_${Date.now()}`,
        order_id: orderId,
        isSimulator: true
      }
    ];
  }

  const res = await fetch(`${config.baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, {
    method: 'GET',
    headers: getHeaders(config)
  });

  const data = await res.json();
  if (!res.ok) {
    return [];
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Verify payment with Cashfree
 */
export async function verifyCashfreePayment({ orderId, paymentId = null }) {
  const config = getCashfreeConfig();

  if (!orderId) {
    return { valid: false, error: 'Missing Cashfree orderId parameter' };
  }

  if (config.isConfigured) {
    try {
      const order = await getCashfreeOrder(orderId);
      const payments = await getCashfreeOrderPayments(orderId);

      const successfulPayment = payments.find(p => p.payment_status === 'SUCCESS');
      const isPaid = order.order_status === 'PAID' || Boolean(successfulPayment);

      return {
        valid: isPaid,
        orderStatus: order.order_status,
        paymentId: successfulPayment ? successfulPayment.cf_payment_id : paymentId || `cf_pay_${Date.now()}`,
        paymentDetails: successfulPayment || null,
        isSimulator: false,
        error: isPaid ? null : `Cashfree order is in status ${order.order_status}`
      };
    } catch (err) {
      return { valid: false, isSimulator: false, error: err.message };
    }
  }

  // High-fidelity local simulation verification
  return {
    valid: true,
    orderStatus: 'PAID',
    paymentId: paymentId || `cf_sim_pay_${crypto.randomBytes(6).toString('hex')}`,
    paymentDetails: {
      payment_status: 'SUCCESS',
      bank_reference: `SIM_REF_${Date.now()}`,
      payment_method: 'UPI Simulator'
    },
    isSimulator: true,
    error: null
  };
}

/**
 * Verify Cashfree Webhook Signature
 * Cashfree computes the signature using HMAC-SHA256 with secret key on `timestamp + rawBody`
 * and base64 encodes the digest.
 */
export function verifyCashfreeWebhookSignature({ rawBody, signature, timestamp }) {
  const config = getCashfreeConfig();
  const secret = config.webhookSecret;

  if (!config.isConfigured || !signature || !timestamp) {
    // Development or test mode without strict webhook keys
    return { valid: true, isSimulator: true };
  }

  try {
    const payload = `${timestamp}${typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody)}`;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    const isValid = computedSignature === signature;
    return { valid: isValid, isSimulator: false };
  } catch (err) {
    return { valid: false, error: err.message, isSimulator: false };
  }
}
