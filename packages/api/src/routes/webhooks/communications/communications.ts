import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { CommunicationLogRepository, AuditLogRepository } from '@scholaracle/database';

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
  const secret = config.webhookSecret ?? process.env['COMMUNICATIONS_WEBHOOK_SECRET'] ?? 'test-webhook-secret';
  const logsRepo = new CommunicationLogRepository(config.database);
  const auditRepo = new AuditLogRepository(config.database);

  // POST /api/webhooks/communications/status
  router.post('/status', async (req: Request, res: Response) => {
    try {
      const provided = (req.headers['x-webhook-secret'] as string | undefined) ?? '';
      if (!provided || provided !== secret) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { logId, status } = req.body as { logId?: string; status?: string };
      if (!logId || !status) {
        res.status(400).json({ success: false, error: 'logId and status are required' });
        return;
      }

      const ok = await logsRepo.updateDeliveryStatus(logId, status as any);
      if (!ok) {
        res.status(404).json({ success: false, error: 'Log not found' });
        return;
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
    } catch (error) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Internal server error' });
    }
  });

  return router;
}


