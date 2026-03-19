import type { Request, Response, NextFunction } from 'express';
import twilio from 'twilio';

/**
 * Express middleware that validates Twilio request signatures.
 * Rejects requests that were not signed by Twilio (prevents spoofed webhooks).
 * Only enabled in production — skipped in dev/test so ngrok tunnels work without auth tokens.
 */
export function requireTwilioSignature(authToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-twilio-signature'] as string | undefined;
    if (!signature) {
      res.status(403).json({ error: 'Missing Twilio signature' });
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
    const host = req.headers['host'] ?? '';
    const url = `${protocol}://${host}${req.originalUrl}`;

    const isValid = twilio.validateRequest(authToken, signature, url, req.body);
    if (!isValid) {
      res.status(403).json({ error: 'Invalid Twilio signature' });
      return;
    }

    next();
  };
}
