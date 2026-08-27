import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import type { AuthService, ConnectorTokenService } from '@scholaracle/auth';
import { StudentRepository } from '@scholaracle/database';
import { verifyAssetSignature } from '../services/assets/signedUrl';

export interface IAssetAuthenticatedRequest extends Request {
  /** Set when either connector or user JWT is valid; use for asset ownership check. */
  assetUserId?: string;
  /** Set when access is via signed URL (skip userId ownership check). */
  signedUrlAccess?: boolean;
}

export interface IConnectorOrUserAuthOptions {
  readonly database?: Db;
  /** JWT secret used for verifying signed asset URLs. */
  readonly jwtSecret?: string;
}

/**
 * Accepts connector JWT, user JWT, or a signed URL (?sig=&exp=).
 * Sets req.assetUserId for GET/HEAD asset access.
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
    // 1. Check for signed URL query parameters (browser-friendly, no header needed)
    const sig = req.query['sig'] as string | undefined;
    const exp = req.query['exp'] as string | undefined;
    const assetId = req.params['assetId'];
    if (sig && exp && assetId && options?.jwtSecret) {
      if (verifyAssetSignature(assetId, sig, exp, options.jwtSecret)) {
        req.signedUrlAccess = true;
        next();
        return;
      }
      res.status(403).json({ success: false, error: 'Invalid or expired signature' });
      return;
    }

    // 2. Check Authorization header (Bearer token)
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
      if (userDecoded.role === 'student') {
        if (!userDecoded.studentId || !options?.database) {
          res.status(403).json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
          return;
        }
        try {
          const student = await new StudentRepository(options.database).findById(
            userDecoded.studentId
          );
          if (!student || student.studentLogin?.userId !== userDecoded.userId) {
            res.status(403).json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
            return;
          }
          req.assetUserId = student.dataUserId();
        } catch {
          res.status(403).json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' });
          return;
        }
        next();
        return;
      }
      req.assetUserId = userDecoded.userId;
      next();
      return;
    }

    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  };
}
