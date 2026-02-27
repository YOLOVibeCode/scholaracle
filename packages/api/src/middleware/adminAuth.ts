import type { Request, Response, NextFunction } from 'express';
import { AdminAuthService } from '@scholaracle/auth';

export interface IAdminAuthenticatedRequest extends Request {
  adminId?: string;
  adminEmail?: string;
  adminRole?: string;
}

/**
 * Admin JWT authentication middleware.
 * Extracts and validates admin JWT token, adds admin info to request.
 *
 * @param adminAuthService - Admin auth service instance
 * @returns Express middleware
 */
export function adminAuthMiddleware(adminAuthService: AdminAuthService) {
  return async (
    req: IAdminAuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
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
      const decoded = await adminAuthService.verifyToken(token);

      if (!decoded) {
        res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
        return;
      }

      // Add admin info to request
      req.adminId = decoded.adminId;
      req.adminEmail = decoded.email;
      req.adminRole = decoded.role;

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  };
}
