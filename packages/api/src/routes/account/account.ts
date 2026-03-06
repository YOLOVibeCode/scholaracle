import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { UserRepository } from '@scholaracle/database';
import {
  EmailTransferService,
  type IEmailTransferEmailService,
} from '../../services/email-transfer';

function getUserId(req: Request): string | null {
  return (req as { userId?: string }).userId ?? null;
}

export interface IAccountRouterConfig {
  readonly database: Db;
  readonly baseUrl: string;
  readonly emailService?: IEmailTransferEmailService;
}

export function createAccountRouter(config: IAccountRouterConfig): Router {
  const router = Router();
  const userRepository = new UserRepository(config.database);
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
  router.post('/email-transfer/initiate', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const { newEmail } = req.body as { newEmail?: string };
      if (!newEmail || !newEmail.trim()) {
        res.status(400).json({ success: false, error: 'New email required' });
        return;
      }

      const normalizedNewEmail = newEmail.trim().toLowerCase();
      if (normalizedNewEmail === user.email.toLowerCase()) {
        res
          .status(400)
          .json({ success: false, error: 'New email must be different from current email' });
        return;
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/account/email-transfer/confirm-old
   * Confirm email transfer from old email address.
   */
  router.get('/email-transfer/confirm-old', async (req: Request, res: Response) => {
    try {
      const { userId, token } = req.query as { userId?: string; token?: string };

      if (!userId || !token) {
        res.status(400).json({ success: false, error: 'Missing userId or token' });
        return;
      }

      await emailTransferService.confirmOldEmail({ userId, token });

      res.status(200).json({
        success: true,
        message: 'Old email confirmed. Waiting for new email confirmation to complete transfer.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/account/email-transfer/confirm-new
   * Confirm email transfer from new email address.
   */
  router.get('/email-transfer/confirm-new', async (req: Request, res: Response) => {
    try {
      const { userId, token } = req.query as { userId?: string; token?: string };

      if (!userId || !token) {
        res.status(400).json({ success: false, error: 'Missing userId or token' });
        return;
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/account/email-transfer/cancel
   * Cancel a pending email transfer.
   */
  router.post('/email-transfer/cancel', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      await emailTransferService.cancelTransfer({ userId });

      res.status(200).json({
        success: true,
        message: 'Email transfer cancelled',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/account/email-transfer/status
   * Get status of pending email transfer.
   */
  router.get('/email-transfer/status', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const user = await userRepository.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
