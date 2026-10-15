import { getCashfreeConfig } from './lib/cashfree.js';

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.json({ error: 'Method not allowed' });
  }

  const config = getCashfreeConfig();

  const appUrl = config.appUrl;

  // Return public properties only - NEVER return secretKey or webhookSecret!
  res.statusCode = 200;
  return res.json({
    appId: config.appId,
    currency: config.currency,
    merchantName: config.merchantName,
    env: config.env,
    apiVersion: config.apiVersion,
    isConfigured: config.isConfigured,
    isLive: config.isLive,
    mode: config.isLive ? 'PRODUCTION' : 'SANDBOX',
    appUrl: config.appUrl,
    networkUrl: config.networkUrl,
    localIp: config.localIp
  });
}
