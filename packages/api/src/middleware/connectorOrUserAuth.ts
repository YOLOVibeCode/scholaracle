import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import type { AuthService, ConnectorTokenService } from '@scholaracle/auth';

export interface IAssetAuthenticatedRequest extends Request {
  /** Set when either connector or user JWT is valid; use for asset ownership check. */
  assetUserId?: string;
}

export interface IConnectorOrUserAuthOptions {
  readonly database?: Db;
}

/**
 * Accepts either connector JWT (scraper) or user JWT (web app). Sets req.assetUserId for GET/HEAD asset access.
 */
export function connectorOrUserAuthMiddleware(
  connectorTokenService: ConnectorTokenService,
  authService: AuthService,
  options?: IConnectorOrUserAuthOptions
) {
  return async (
    req: IAssetAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Missing or invalid authorization header' });
      return;
    }
    const token = authHeader.substring(7);

    const connectorDecoded = connectorTokenService.verifyToken(token);
    if (connectorDecoded) {
      if (options?.database && connectorDecoded.jti) {
        try {
          const revoked = await options.database
            .collection('revoked_connector_tokens')
            .findOne({ jti: connectorDecoded.jti, revokedAt: { $ne: null } });
          if (revoked) {
            res.status(401).json({ success: false, error: 'Token has been revoked' });
            return;
          }
        } catch {
          // fail open
        }
      }
      req.assetUserId = connectorDecoded.userId;
      next();
      return;
    }

    const userDecoded = await authService.verifyToken(token);
    if (userDecoded) {
      req.assetUserId = userDecoded.userId;
      next();
      return;
    }

    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  };
}
