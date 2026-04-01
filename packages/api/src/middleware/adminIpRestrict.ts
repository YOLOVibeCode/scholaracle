import type { Request, Response, NextFunction } from 'express';
import { getClientIp } from '../utils/getClientIp';

/**
 * Admin IP allowlist middleware.
 * Restricts admin API access to a configurable set of IP addresses.
 *
 * This is opt-in: if no IPs are configured, all requests pass through.
 * Configure via ADMIN_IP_ALLOWLIST environment variable (comma-separated IPs).
 *
 * Must be mounted BEFORE admin route handlers.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function adminIpRestrict(allowedIps?: readonly string[]) {
  const ipSet = new Set((allowedIps ?? []).map((ip) => ip.trim()).filter(Boolean));

  return (req: Request, res: Response, next: NextFunction): void => {
    // If no IPs configured, allow all (opt-in feature)
    if (ipSet.size === 0) {
      next();
      return;
    }

    const clientIp = getClientIp(req);

    if (!clientIp || !ipSet.has(clientIp)) {
      res.status(403).json({
        success: false,
        error: 'Access denied: IP address not in allowlist',
      });
      return;
    }

    next();
  };
}

/**
 * Create IP allowlist middleware from environment variable.
 * Reads ADMIN_IP_ALLOWLIST as a comma-separated string.
 */
export function adminIpRestrictFromEnv(): ReturnType<typeof adminIpRestrict> {
  const envIps = process.env['ADMIN_IP_ALLOWLIST'];
  const ips = envIps ? envIps.split(',') : [];
  return adminIpRestrict(ips);
}
