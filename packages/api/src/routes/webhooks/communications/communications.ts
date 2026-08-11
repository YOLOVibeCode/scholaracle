import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  CommunicationLogRepository,
  AuditLogRepository,
  type CommunicationStatus,
} from '@scholaracle/database';
import { AuthenticationError, NotFoundError, ValidationError } from '@scholaracle/contracts';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface ICommunicationsWebhooksRouterConfig {
  readonly database: Db;
  readonly webhookSecret?: string;
}

/**
 * Minimal webhook ingestion surface for delivery tracking.
 * Protected by a shared secret header for now.
 */
export function communicationsWebhooksRouter(config: ICommunicationsWebhooksRouterConfig): Router {
  const router = Router();
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const secret =
    config.webhookSecret ??
    process.env['COMMUNICATIONS_WEBHOOK_SECRET'] ??
    (nodeEnv === 'production' ? undefined : 'test-webhook-secret');
  if (!secret) {
    throw new Error('COMMUNICATIONS_WEBHOOK_SECRET is required in production');
  }
  const logsRepo = new CommunicationLogRepository(config.database);
  const auditRepo = new AuditLogRepository(config.database);

  // POST /api/webhooks/communications/status
  router.post(
    '/status',
    asyncHandler(async (req: Request, res: Response) => {
      // Shared-secret check: 401 status must stay exactly as-is for the provider.
      const provided = (req.headers['x-webhook-secret'] as string | undefined) ?? '';
      if (!provided || provided !== secret) {
        throw new AuthenticationError('Unauthorized');
      }

      const { logId, status } = req.body as { logId?: string; status?: string };
      if (!logId || !status) {
        throw new ValidationError('logId and status are required');
      }

      const ok = await logsRepo.updateDeliveryStatus(logId, status as CommunicationStatus);
      if (!ok) {
        throw new NotFoundError('Log not found');
      }

      // Record a system audit entry (masked by audit log masking later if needed)
      await auditRepo.create({
        adminUserId: 'system',
        adminEmail: 'system@webhook',
        action: 'system:config_change',
        entityType: 'communication',
        entityId: logId,
        reason: 'Webhook updated communication status',
        metadata: { status },
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'webhook',
      });

      res.status(200).json({ success: true });
    })
  );

  return router;
}
