import os from 'os';

/**
 * Returns the local network IPv4 address (e.g. 192.168.x.x or 10.x.x.x)
 */
export function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      // Look for external IPv4 address
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

/**
 * Resolves the base URL for the application.
 * Priority:
 * 1. process.env.APP_URL or process.env.VITE_APP_URL (production / tunnel URL)
 * 2. Local network IP (e.g. http://10.192.28.99:5173) so phones on the same Wi-Fi can reach it
 * 3. Fallback to localhost:5173
 */
export function getAppBaseUrl(port = 5173) {
  const envUrl = process.env.APP_URL || process.env.VITE_APP_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  const localIp = getLocalIpAddress();
  if (localIp && localIp !== 'localhost') {
    return `http://${localIp}:${port}`;
  }

  return `http://localhost:${port}`;
}
