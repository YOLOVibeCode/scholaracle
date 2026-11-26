import type { Request, Response, NextFunction } from 'express';
import { getClientIp } from '../utils/getClientIp';

/**
 * Admin IP allowlist middleware.
 * Restricts admin API access to a configurable set of IP addresses.
 *
 * This is opt-in: if no IPs are configured, all requests pass through.
 * Configure via ADMIN_IP_ALLOWLIST environment variable (comma-separated IPs).
 * Addresses are compared as written: no ranges.
 *
 * The address checked is the first `X-Forwarded-For` entry, or the socket's address when
 * there is none (see getClientIp). On Railway the edge replaces whatever the caller sent
 * with the caller's real address, so a caller cannot choose it there. Behind a proxy that
 * passes the caller's header through, a caller could name a listed address.
 *
 * Must be mounted BEFORE admin route handlers. The server mounts it in front of
 * /api/admin, and POST /api/scrapers/repair (the one admin-token route elsewhere) applies
 * it too.
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
