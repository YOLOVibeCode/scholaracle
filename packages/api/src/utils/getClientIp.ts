import type { Request } from 'express';

/**
 * Extract the client IP address from the request.
 * Prefers X-Forwarded-For (first entry) for proxied requests,
 * falls back to socket.remoteAddress.
 */
export function getClientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    ''
  );
}
