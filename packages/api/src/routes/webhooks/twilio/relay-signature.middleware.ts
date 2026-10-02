import type { Request, Response, NextFunction } from 'express';
import { verifyRelayInboundSignature } from '../../../services/sms/verifyRelayInboundSignature';

export interface IRelaySignatureOptions {
  readonly publicUrl: string;
  readonly secret?: string;
}

/**
 * Validates x-relay-signature on Twilio webhook forwards from the Noctusoft relay.
 */
export function requireRelayInboundSignature(options: IRelaySignatureOptions) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const nodeEnv = process.env['NODE_ENV'] ?? 'development';
    const secret = options.secret ?? process.env['RELAY_INBOUND_SECRET'] ?? '';
    if (!secret) {
      if (nodeEnv === 'production') {
        res.status(503).json({ error: 'Relay inbound secret not configured' });
        return;
      }
      next();
      return;
    }
    const signature = req.headers['x-relay-signature'] as string | undefined;
    if (!signature) {
      res.status(401).json({ error: 'Missing relay signature' });
      return;
    }
    const captured = (req as Request & { rawBody?: unknown }).rawBody;
    const rawBody = typeof captured === 'string' ? captured : '';
    const isValid = verifyRelayInboundSignature(options.publicUrl, rawBody, signature, secret);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid relay signature' });
      return;
    }
    next();
  };
}
