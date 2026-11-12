import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { OAuthAccountRepository, UserRepository, type IUserDevice } from '@scholaracle/database';
import { verifyAppleIdentityToken } from '../auth/appleIdentityToken';
import { appleOAuthAudiences } from '../auth/appleAudiences';
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
  type IPushTokenRequest,
  type IPushTokenDeleteRequest,
  type IPushTokenResponse,
  type IAccountDeleteRequest,
  type IAccountDeleteResponse,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireParent } from '../../middleware/requireRole';
import {
  EmailTransferService,
  type IEmailTransferEmailService,
} from '../../services/email-transfer';
import { AccountDeletionService } from '../../services/account-deletion';
import type { IAppleTokenRevoker } from '../../services/apple/appleTokenRevocation';
import { logger } from '../../logger';

function getUserId(req: Request): string | null {
  return (req as { userId?: string }).userId ?? null;
}

export interface IAccountRouterConfig {
  readonly database: Db;
  readonly baseUrl: string;
  readonly emailService?: IEmailTransferEmailService;
  /** Revokes Sign in with Apple tokens at account deletion. Absent = nothing is revoked. */
  readonly appleTokenRevoker?: IAppleTokenRevoker;
}

/** Best effort: logs the outcome (no token, code or account id) and never throws. */
async function revokeAppleTokens(
  revoker: IAppleTokenRevoker | undefined,
  authorizationCode: string,
  clientId: string,
  sub: string
): Promise<void> {
  if (!revoker) return;
  if (authorizationCode === '') {
    logger.warn('Apple account deleted without an authorization code: no token was revoked');
    return;
  }
  try {
    const outcome = await revoker.revokeWithAuthorizationCode(authorizationCode, clientId, sub);
    if (outcome.status === 'revoked') {
      logger.info('Apple tokens revoked for a deleted account');
    } else if (outcome.status === 'not_configured') {
      logger.warn('Apple token revocation is not configured on this server: no token was revoked');
    } else {
      logger.error(
        { step: outcome.step, reason: outcome.reason },
        'Apple token revocation failed for a deleted account'
      );
    }
  } catch {
    logger.error('Apple token revocation threw for a deleted account');
  }
}

export function createAccountRouter(config: IAccountRouterConfig): Router {
  const router = Router();
  const userRepository = new UserRepository(config.database);
  const oauthAccountRepository = new OAuthAccountRepository(config.database);
  const emailTransferService = new EmailTransferService({
    database: config.database,
    userRepository,
    baseUrl: config.baseUrl,
    emailService: config.emailService,
    tokenExpiryHours: 48,
  });

  /**
   * POST /api/account/email-transfer/initiate
   * Initiate an email transfer for the current user.
   */
  router.post(
    '/email-transfer/initiate',
    requireParent,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const { newEmail } = req.body as { newEmail?: string };
      if (!newEmail || !newEmail.trim()) {
        throw new ValidationError('New email required');
      }

      const normalizedNewEmail = newEmail.trim().toLowerCase();
      if (normalizedNewEmail === user.email.toLowerCase()) {
        throw new ValidationError('New email must be different from current email');
      }

      await emailTransferService.initiateUserTransfer({
        userId,
        oldEmail: user.email,
        newEmail: normalizedNewEmail,
      });

      res.status(200).json({
        success: true,
        message:
          'Email transfer initiated. Please check both email addresses for confirmation links.',
      });
    })
  );

  /**
   * GET /api/account/email-transfer/confirm-old
   * Confirm email transfer from old email address.
   */
  router.get(
    '/email-transfer/confirm-old',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId, token } = req.query as { userId?: string; token?: string };

      if (!userId || !token) {
        throw new ValidationError('Missing userId or token');
      }

      await emailTransferService.confirmOldEmail({ userId, token });

      res.status(200).json({
        success: true,
        message: 'Old email confirmed. Waiting for new email confirmation to complete transfer.',
      });
    })
  );

  /**
   * GET /api/account/email-transfer/confirm-new
   * Confirm email transfer from new email address.
   */
  router.get(
    '/email-transfer/confirm-new',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId, token } = req.query as { userId?: string; token?: string };

      if (!userId || !token) {
        throw new ValidationError('Missing userId or token');
      }

      const result = await emailTransferService.confirmNewEmail({ userId, token });

      if (result.completed) {
        res.status(200).json({
          success: true,
          completed: true,
          message: 'Email transfer completed successfully! Your email has been updated.',
        });
      } else {
        res.status(200).json({
          success: true,
          completed: false,
          message: 'New email confirmed. Waiting for old email confirmation to complete transfer.',
        });
      }
    })
  );

  /**
   * POST /api/account/email-transfer/cancel
   * Cancel a pending email transfer.
   */
  router.post(
    '/email-transfer/cancel',
    requireParent,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      await emailTransferService.cancelTransfer({ userId });

      res.status(200).json({
        success: true,
        message: 'Email transfer cancelled',
      });
    })
  );

  /**
   * GET /api/account/email-transfer/status
   * Get status of pending email transfer.
   */
  router.get(
    '/email-transfer/status',
    requireParent,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (!user.emailTransferRequest) {
        res.status(200).json({ success: true, pending: false });
        return;
      }

      // Check for confirmations
      const confirmColl = config.database.collection('email_transfer_confirmations');
      const [oldConfirm, newConfirm] = await Promise.all([
        confirmColl.findOne({ userId, type: 'old' }),
        confirmColl.findOne({ userId, type: 'new' }),
      ]);

      res.status(200).json({
        success: true,
        pending: true,
        newEmail: user.emailTransferRequest.newEmail,
        expiresAt: user.emailTransferRequest.expiresAt,
        oldEmailConfirmed: !!oldConfirm,
        newEmailConfirmed: !!newConfirm,
      });
    })
  );

  /**
   * POST /api/account/push-token
   * Register or replace the Expo push token for the current user's device.
   */
  router.post(
    '/push-token',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      const { expoPushToken, deviceId, type } = req.body as Partial<IPushTokenRequest>;
      if (!expoPushToken || typeof expoPushToken !== 'string' || !expoPushToken.trim()) {
        throw new ValidationError('expoPushToken required');
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const id = deviceId?.trim() || 'mobile-default';
      const deviceType: 'ios' | 'android' | 'web' =
        type === 'android' || type === 'web' ? type : 'ios';
      const existing = [...(user.devices ?? [])];
      const idx = existing.findIndex((d) => d.deviceId === id);
      const audience = user.role === 'student' ? 'student' : 'parent';
      const nextDevice: IUserDevice = {
        deviceId: id,
        type: deviceType,
        pushToken: expoPushToken.trim(),
        lastActive: new Date(),
        audience,
        ...(audience === 'student' && user.studentId ? { studentId: user.studentId } : {}),
      };
      const devices =
        idx >= 0
          ? [...existing.slice(0, idx), nextDevice, ...existing.slice(idx + 1)]
          : [...existing, nextDevice];

      await userRepository.update(userId, { devices });
      res.status(200).json({ success: true } satisfies IPushTokenResponse);
    })
  );

  /**
   * DELETE /api/account/push-token
   * Remove the push registration for a device (sign-out). Idempotent:
   * deleting an unknown deviceId succeeds.
   */
  router.delete(
    '/',
    requireParent,
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      const { password, appleIdentityToken, appleNonce, appleAuthorizationCode } = (req.body ??
        {}) as Partial<IAccountDeleteRequest>;
      const hasPassword = typeof password === 'string' && password.trim() !== '';
      const hasApple = typeof appleIdentityToken === 'string' && appleIdentityToken.trim() !== '';
      if (!hasPassword && !hasApple) {
        throw new ValidationError('password or Apple confirmation required');
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      if (hasPassword) {
        const isValidPassword = await UserRepository.verifyPassword(
          password as string,
          user.passwordHash
        );
        if (!isValidPassword) {
          throw new AuthenticationError('Invalid password');
        }
      } else {
        // Apple-created accounts have no known password: require a FRESH Apple sign-in whose
        // account id is the one linked to THIS user.
        const nonce = typeof appleNonce === 'string' ? appleNonce.trim() : '';
        let sub: string;
        let aud: string;
        try {
          const verified = await verifyAppleIdentityToken({
            identityToken: (appleIdentityToken as string).trim(),
            rawNonce: nonce === '' ? undefined : nonce,
            audiences: appleOAuthAudiences(),
          });
          sub = verified.sub;
          aud = verified.aud;
        } catch {
          throw new AuthenticationError('Invalid Apple identity token');
        }
        const link = await oauthAccountRepository.findByProviderAndId('apple', sub);
        if (!link || link.userId !== userId) {
          throw new AuthenticationError('This Apple account is not linked to your account');
        }

        // Apple requires the user's tokens to be revoked when the account is deleted. The
        // person asked for deletion, so a failed revocation is logged and never stops it.
        const code =
          typeof appleAuthorizationCode === 'string' ? appleAuthorizationCode.trim() : '';
        await revokeAppleTokens(config.appleTokenRevoker, code, aud, sub);
      }

      const deletionService = new AccountDeletionService(config.database);
      await deletionService.deleteParentAccount(userId);

      res.status(200).json({ success: true } satisfies IAccountDeleteResponse);
    })
  );

  router.delete(
    '/push-token',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      const { deviceId } = req.body as Partial<IPushTokenDeleteRequest>;
      if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
        throw new ValidationError('deviceId required');
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        throw new NotFoundError('User not found');
      }

      const devices = (user.devices ?? []).filter((d) => d.deviceId !== deviceId.trim());
      if (devices.length !== (user.devices ?? []).length) {
        await userRepository.update(userId, { devices });
      }
      res.status(200).json({ success: true } satisfies IPushTokenResponse);
    })
  );

  return router;
}
