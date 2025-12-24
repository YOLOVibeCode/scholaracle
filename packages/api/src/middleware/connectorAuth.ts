import type { Request, Response, NextFunction } from 'express';
import { ConnectorTokenService } from '@scholaracle/auth';

export interface IConnectorAuthenticatedRequest extends Request {
  connectorUserId?: string;
  connectorJti?: string;
}

export function connectorAuthMiddleware(connectorTokenService: ConnectorTokenService) {
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

    req.connectorUserId = decoded.userId;
    req.connectorJti = decoded.jti;
    next();
  };
}


