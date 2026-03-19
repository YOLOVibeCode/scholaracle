import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { CommunicationLogRepository } from '@scholaracle/database';
import type { CommunicationStatus } from '@scholaracle/database';
import type { IAuthenticatedRequest } from '../../middleware/auth';

export interface IEmailHistoryRouterConfig {
  readonly database: Db;
}

export function emailHistoryRouter(config: IEmailHistoryRouterConfig): Router {
  const router = Router();
  const commLogRepo = new CommunicationLogRepository(config.database);

  /**
   * GET /api/email-history
   * List email communication logs for the authenticated user (paginated).
   */
  router.get('/', (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      try {
        const authReq = req as IAuthenticatedRequest;
        const userId = authReq.userId;
        if (!userId) {
          res.status(401).json({ success: false, error: 'Unauthorized' });
          return;
        }

        const page = Math.max(1, parseInt(req.query['page'] as string, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query['limit'] as string, 10) || 25));
        const status = (req.query['status'] as CommunicationStatus) || undefined;

        const result = await commLogRepo.findByUserIdPaginated(userId, {
          status,
          channel: 'email',
          page,
          limit,
        });

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
        });
      } catch {
        res.status(500).json({ success: false, error: 'Failed to fetch email history' });
      }
    })();
  });

  /**
   * GET /api/email-history/:id
   * Get a single email log with full HTML content for preview.
   */
  router.get('/:id', (req: Request, res: Response) => {
    void (async (): Promise<void> => {
      try {
        const authReq = req as IAuthenticatedRequest;
        const userId = authReq.userId;
        if (!userId) {
          res.status(401).json({ success: false, error: 'Unauthorized' });
          return;
        }

        const log = await commLogRepo.findByIdAndUserId(req.params['id'] ?? '', userId);
        if (!log) {
          res.status(404).json({ success: false, error: 'Email not found' });
          return;
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
      } catch {
        res.status(500).json({ success: false, error: 'Failed to fetch email detail' });
      }
    })();
  });

  return router;
}
