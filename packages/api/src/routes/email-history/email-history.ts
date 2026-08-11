import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { CommunicationLogRepository, StudentRepository } from '@scholaracle/database';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@scholaracle/contracts';
import type { CommunicationStatus } from '@scholaracle/database';
import type { IEmailTransport } from '@scholaracle/agents';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';

export interface IEmailHistoryRouterConfig {
  readonly database: Db;
  readonly transport: IEmailTransport;
  readonly fromEmail: string;
  readonly fromName: string;
}

export function emailHistoryRouter(config: IEmailHistoryRouterConfig): Router {
  const router = Router();
  const commLogRepo = new CommunicationLogRepository(config.database);
  const studentRepo = new StudentRepository(config.database);

  /**
   * GET /api/email-history
   * List email communication logs (paginated).
   * Optional ?studentId= to filter by student (shows all parents' emails for that student).
   */
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      const page = Math.max(1, parseInt(req.query['page'] as string, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string, 10) || 25));
      const status = (req.query['status'] as CommunicationStatus) || undefined;
      const studentId = (req.query['studentId'] as string) || undefined;

      let canResend = true;

      let result;
      if (studentId) {
        const student = await studentRepo.findById(studentId);
        if (!student || !student.hasAccess(userId)) {
          throw new NotFoundError('Student not found');
        }
        canResend = student.canAdmin(userId);
        result = await commLogRepo.findByStudentPaginated(studentId, {
          status,
          channel: 'email',
          page,
          limit,
        });
      } else {
        result = await commLogRepo.findByUserIdPaginated(userId, {
          status,
          channel: 'email',
          page,
          limit,
        });
      }

      const data = result.logs.map((log) => ({
        id: log._id?.toString() ?? '',
        subject: log.subject,
        recipientEmail: log.recipientEmail,
        status: log.status,
        type: log.type,
        templateName: log.templateName,
        sentAt: log.sentAt?.toISOString(),
        createdAt: log.createdAt.toISOString(),
        failureReason: log.failureReason,
        hasHtmlContent: !!log.htmlContent,
      }));

      res.json({
        success: true,
        data,
        total: result.total,
        page,
        limit,
        totalPages: Math.ceil(result.total / limit),
        canResend,
      });
    })
  );

  /**
   * GET /api/email-history/:id
   * Get a single email log with full HTML content for preview.
   */
  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      // Try user-owned first, then check if user has access via student
      let log = await commLogRepo.findByIdAndUserId(req.params['id'] ?? '', userId);
      if (!log) {
        // Check if this is a student-scoped log the user has access to
        const fullLog = await commLogRepo.findById(req.params['id'] ?? '');
        if (fullLog?.relatedEntityId) {
          const student = await studentRepo.findById(fullLog.relatedEntityId);
          if (student && student.hasAccess(userId)) {
            log = fullLog;
          }
        }
      }

      if (!log) {
        throw new NotFoundError('Email not found');
      }

      res.json({
        success: true,
        data: {
          id: log._id?.toString() ?? '',
          subject: log.subject,
          content: log.content,
          htmlContent: log.htmlContent,
          recipientEmail: log.recipientEmail,
          status: log.status,
          type: log.type,
          channel: log.channel,
          templateName: log.templateName,
          sentAt: log.sentAt?.toISOString(),
          createdAt: log.createdAt.toISOString(),
          failureReason: log.failureReason,
        },
      });
    })
  );

  /**
   * POST /api/email-history/:id/resend
   * Resend an email. Only account owners or admin shared parents can resend.
   */
  router.post(
    '/:id/resend',
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      // Find the original log
      let log = await commLogRepo.findByIdAndUserId(req.params['id'] ?? '', userId);
      let canResend = true;

      if (!log) {
        // Check student-scoped access
        const fullLog = await commLogRepo.findById(req.params['id'] ?? '');
        if (fullLog?.relatedEntityId) {
          const student = await studentRepo.findById(fullLog.relatedEntityId);
          if (student && student.hasAccess(userId)) {
            canResend = student.canAdmin(userId);
            log = fullLog;
          }
        }
      }

      if (!log) {
        throw new NotFoundError('Email not found');
      }

      if (!canResend) {
        throw new ForbiddenError('Only account owners can resend emails');
      }

      if (!log.htmlContent && !log.content) {
        throw new ValidationError('No email content available to resend');
      }

      const recipientEmail = log.recipientEmail;
      if (!recipientEmail) {
        throw new ValidationError('No recipient email found');
      }

      // Send the email
      await config.transport.send({
        to: recipientEmail,
        from: { email: config.fromEmail, name: config.fromName },
        subject: log.subject ?? 'Scholarmancy Digest (Resent)',
        text: log.content ?? '',
        html: log.htmlContent ?? log.content ?? '',
      });

      // Create a new comm log for the resend
      await commLogRepo.create({
        userId: log.userId,
        channel: 'email',
        type: 'notification',
        subject: log.subject ?? 'Scholarmancy Digest (Resent)',
        content: log.content ?? '',
        htmlContent: log.htmlContent,
        recipientEmail,
        status: 'sent',
        sentAt: new Date(),
        triggeredBy: 'user_action',
        templateName: 'email_digest_resend',
        relatedEntityType: log.relatedEntityType,
        relatedEntityId: log.relatedEntityId,
      });

      res.json({ success: true, message: `Email resent to ${recipientEmail}` });
    })
  );

  /**
   * DELETE /api/email-history
   * Delete all email history for the current user. Account owners only.
   */
  router.delete(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      const deleted = await commLogRepo.deleteByUserId(userId);
      res.json({ success: true, deleted });
    })
  );

  return router;
}
