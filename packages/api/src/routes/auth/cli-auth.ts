/**
 * Device Authorization Grant for CLI tools.
 *
 * Flow:
 *   1. CLI calls POST /api/auth/cli/request → gets { deviceCode, userCode, verificationUrl }
 *   2. User visits verificationUrl, logs in, enters userCode, clicks Approve
 *   3. CLI polls GET /api/auth/cli/poll/:deviceCode until approved
 *   4. On approval, CLI receives a JWT + refresh token
 *
 * Device auth requests expire after 15 minutes.
 */

import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import type { Db, Collection } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { NotFoundError, ValidationError } from '@scholaracle/contracts';
import { authMiddleware, type IAuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { UserRepository } from '@scholaracle/database';

const DEVICE_CODE_BYTES = 32;
const EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const POLL_INTERVAL_S = 5;

interface IDeviceAuthRequest {
  deviceCode: string;
  userCode: string;
  status: 'pending' | 'approved' | 'denied';
  approvedByUserId?: string;
  approvedByEmail?: string;
  token?: string;
  refreshToken?: string;
  createdAt: Date;
  expiresAt: Date;
}

function generateUserCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O (avoid confusion)
  const digits = '0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += letters[crypto.randomInt(letters.length)];
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += digits[crypto.randomInt(digits.length)];
  }
  return code;
}

function getCollection(database: Db): Collection<IDeviceAuthRequest> {
  return database.collection<IDeviceAuthRequest>('cli_auth_requests');
}

export interface ICliAuthRouterConfig {
  readonly database: Db;
  readonly authService: AuthService;
  readonly baseUrl?: string;
}

export function cliAuthRouter(config: ICliAuthRouterConfig): Router {
  const router = Router();
  const { database, authService } = config;
  const baseUrl = config.baseUrl ?? process.env['BASE_URL'] ?? process.env['WEB_URL'] ?? '';

  // Ensure TTL index exists (idempotent)
  void getCollection(database).createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  /**
   * POST /api/auth/cli/request
   * Generate a new device authorization request. No auth required.
   */
  router.post(
    '/request',
    asyncHandler(async (_req: Request, res: Response) => {
      const deviceCode = crypto.randomBytes(DEVICE_CODE_BYTES).toString('hex');
      const userCode = generateUserCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + EXPIRY_MS);

      await getCollection(database).insertOne({
        deviceCode,
        userCode,
        status: 'pending',
        createdAt: now,
        expiresAt,
      });

      const verificationUrl = `${baseUrl}/cli-auth?code=${userCode}`;

      res.json({
        success: true,
        deviceCode,
        userCode,
        verificationUrl,
        expiresIn: Math.floor(EXPIRY_MS / 1000),
        pollInterval: POLL_INTERVAL_S,
      });
    })
  );

  /**
   * GET /api/auth/cli/poll/:deviceCode
   * Poll for authorization status. No auth required (deviceCode is secret).
   */
  router.get(
    '/poll/:deviceCode',
    asyncHandler(async (req: Request, res: Response) => {
      const { deviceCode } = req.params;
      const record = await getCollection(database).findOne({ deviceCode });

      if (!record) {
        throw new NotFoundError('Device code not found or expired');
      }

      if (record.expiresAt < new Date()) {
        res.status(410).json({ success: false, error: 'Device code expired', status: 'expired' });
        return;
      }

      if (record.status === 'denied') {
        res.json({ success: false, status: 'denied' });
        return;
      }

      if (record.status === 'approved' && record.token) {
        // Delete the record after successful retrieval (one-time use)
        await getCollection(database).deleteOne({ deviceCode });
        res.json({
          success: true,
          status: 'approved',
          token: record.token,
          refreshToken: record.refreshToken,
        });
        return;
      }

      res.json({ success: true, status: 'pending', pollInterval: POLL_INTERVAL_S });
    })
  );

  /**
   * POST /api/auth/cli/approve
   * Approve a device code. Requires authenticated user.
   */
  router.post(
    '/approve',
    authMiddleware(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAuthenticatedRequest;
      const { userCode } = req.body as { userCode?: string };

      if (!userCode || typeof userCode !== 'string') {
        throw new ValidationError('userCode is required');
      }

      const normalizedCode = userCode.toUpperCase().trim();
      const record = await getCollection(database).findOne({
        userCode: normalizedCode,
        status: 'pending',
        expiresAt: { $gt: new Date() },
      });

      if (!record) {
        throw new NotFoundError('Invalid or expired code');
      }

      const userId = authReq.userId!;
      const email = authReq.userEmail!;

      // Issue a long-lived token for CLI use (7 days)
      const token = authService.issueTokenForUser(userId, email);

      // Look up user name for response
      const userRepo = new UserRepository(database);
      const user = await userRepo.findById(userId);

      await getCollection(database).updateOne(
        { userCode: normalizedCode, status: 'pending' },
        {
          $set: {
            status: 'approved' as const,
            approvedByUserId: userId,
            approvedByEmail: email,
            token,
          },
        }
      );

      res.json({
        success: true,
        message: `CLI authorized for ${user?.name ?? email}`,
      });
    })
  );

  /**
   * POST /api/auth/cli/deny
   * Deny a device code. Requires authenticated user.
   */
  router.post(
    '/deny',
    authMiddleware(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const { userCode } = req.body as { userCode?: string };
      if (!userCode || typeof userCode !== 'string') {
        throw new ValidationError('userCode is required');
      }

      const normalizedCode = userCode.toUpperCase().trim();
      const result = await getCollection(database).updateOne(
        { userCode: normalizedCode, status: 'pending', expiresAt: { $gt: new Date() } },
        { $set: { status: 'denied' as const } }
      );

      if (result.matchedCount === 0) {
        throw new NotFoundError('Invalid or expired code');
      }

      res.json({ success: true });
    })
  );

  return router;
}
