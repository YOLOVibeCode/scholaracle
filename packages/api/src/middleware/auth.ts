import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '@scholaracle/auth';

export interface IAuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

/**
 * JWT authentication middleware.
 * Extracts and validates JWT token, adds user info to request.
 *
 * @param authService - Auth service instance
 * @returns Express middleware
 */
export function authMiddleware(authService: AuthService) {
  return async (req: IAuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({
          success: false,
          error: 'Missing or invalid authorization header',
        });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      const decoded = await authService.verifyToken(token);

      if (!decoded) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
        return;
      }

      // Add user info to request
      req.userId = decoded.userId;
      req.userEmail = decoded.email;

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  };
}

