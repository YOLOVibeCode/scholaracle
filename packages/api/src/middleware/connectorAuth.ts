import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import { ConnectorTokenService } from '@scholaracle/auth';

export interface IConnectorAuthenticatedRequest extends Request {
  connectorUserId?: string;
  connectorJti?: string;
}

export interface IConnectorAuthMiddlewareOptions {
  /** Optional MongoDB database for jti revocation checks. */
  readonly database?: Db;
}

export function connectorAuthMiddleware(
  connectorTokenService: ConnectorTokenService,
  options?: IConnectorAuthMiddlewareOptions
) {
  return (req: IConnectorAuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = connectorTokenService.verifyToken(token);

    if (!decoded) {
      res.status(401).json({ success: false, error: 'Invalid or expired token' });
      return;
    }

    // Check jti revocation if database is available
    if (options?.database && decoded.jti) {
      options.database
        .collection('revoked_connector_tokens')
        .findOne({ jti: decoded.jti, revokedAt: { $ne: null } })
        .then((revoked) => {
          if (revoked) {
            res.status(401).json({ success: false, error: 'Token has been revoked' });
            return;
          }
          req.connectorUserId = decoded.userId;
          req.connectorJti = decoded.jti;
          next();
        })
        .catch(() => {
          // If revocation check fails, allow through (fail open for availability)
          req.connectorUserId = decoded.userId;
          req.connectorJti = decoded.jti;
          next();
        });
      return;
    }

    req.connectorUserId = decoded.userId;
    req.connectorJti = decoded.jti;
    next();
  };
}
