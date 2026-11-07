import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import { ConnectorTokenService } from '@scholaracle/auth';
import { ConnectorDeviceRepository } from '@scholaracle/database';
import { logger } from '../logger';

export interface IConnectorAuthenticatedRequest extends Request {
  connectorUserId?: string;
  connectorJti?: string;
  connectorDeviceId?: string;
}

export interface IConnectorAuthMiddlewareOptions {
  /** Optional MongoDB database for jti revocation checks. */
  readonly database?: Db;
}

async function connectorTokenAllowed(
  database: Db,
  userId: string,
  deviceId: string,
  jti: string
): Promise<boolean> {
  const revoked = await database
    .collection('revoked_connector_tokens')
    .findOne({ jti, revokedAt: { $ne: null } });
  if (revoked) return false;

  const deviceRepo = new ConnectorDeviceRepository(database);
  const device = await deviceRepo.findByUserAndDevice(userId, deviceId);
  if (!device) return false;
  return device.hasActiveJti(jti);
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

    const attach = (): void => {
      req.connectorUserId = decoded.userId;
      req.connectorJti = decoded.jti;
      req.connectorDeviceId = decoded.deviceId;
      next();
    };

    if (options?.database) {
      connectorTokenAllowed(options.database, decoded.userId, decoded.deviceId, decoded.jti)
        .then((allowed) => {
          if (!allowed) {
            res.status(401).json({ success: false, error: 'Token has been revoked' });
            return;
          }
          attach();
        })
        .catch((err: unknown) => {
          logger.warn(
            { error: err instanceof Error ? err.message : String(err) },
            'Connector token revocation check failed'
          );
          res.status(401).json({ success: false, error: 'Token verification unavailable' });
        });
      return;
    }

    attach();
  };
}
