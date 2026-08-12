import UAParser from 'ua-parser-js';
import type { ISessionDeviceInfo } from '@scholaracle/database';

/**
 * Parse User-Agent header into device info for session display.
 */
export function parseUserAgent(userAgent: string | undefined): ISessionDeviceInfo {
  if (!userAgent || typeof userAgent !== 'string') {
    return { browser: 'Unknown', os: 'Unknown', device: 'Desktop' };
  }
  const parser = new (
    UAParser as unknown as new (ua?: string) => {
      getBrowser(): unknown;
      getOS(): unknown;
      getDevice(): unknown;
    }
  )(userAgent);
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();
  const browserName = (browser as { name?: string }).name;
  const browserVersion = (browser as { version?: string }).version;
  const osName = (os as { name?: string }).name;
  const osVersion = (os as { version?: string }).version;
  const deviceType = (device as { type?: string }).type;
  const deviceVendor = (device as { vendor?: string }).vendor;
  const deviceModel = (device as { model?: string }).model;
  return {
    userAgent: userAgent.slice(0, 256),
    browser: [browserName, browserVersion].filter(Boolean).join(' ') || 'Unknown',
    os: [osName, osVersion].filter(Boolean).join(' ') || 'Unknown',
    device: deviceType || deviceVendor || deviceModel || 'Desktop',
  };
}
