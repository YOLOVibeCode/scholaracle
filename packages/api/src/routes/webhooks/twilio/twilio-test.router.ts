import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { CommunicationLogRepository } from '@scholaracle/database';
import { InternalError, ValidationError } from '@scholaracle/contracts';
import { createSmsStack } from '../../../services/sms/createSmsStack';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface ITwilioTestRouterConfig {
  readonly database: Db;
}

/**
 * Test endpoints for SMS relay debugging (dev/staging only).
 */
export function twilioTestRouter(config: ITwilioTestRouterConfig): Router {
  const router = Router();
  const commLogRepo = new CommunicationLogRepository(config.database);

  router.get(
    '/simulate-inbound-sms',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const from = (req.query['from'] as string) ?? '+15005550006';
      const body = (req.query['body'] as string) ?? 'Test message';
      const to = (req.query['to'] as string) ?? '+18449003903';

      res.json({
        success: true,
        simulated: {
          From: from,
          To: to,
          Body: body,
          MessageSid: `SM_TEST_${Date.now()}`,
        },
        note: 'POST to /api/webhooks/twilio/sms with relay signature',
      });
    })
  );

  router.get(
    '/simulate-status-callback',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const messageSid = (req.query['messageSid'] as string) ?? 'SM_TEST_123';
      const status = (req.query['status'] as string) ?? 'delivered';

      res.json({
        success: true,
        simulated: { MessageSid: messageSid, MessageStatus: status },
      });
    })
  );

  router.get(
    '/comm-logs',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const limit = parseInt((req.query['limit'] as string) ?? '10', 10);
      const logs = await commLogRepo.filterByChannel('sms');
      const recent = logs.slice(0, limit);
      res.json({ success: true, count: recent.length, logs: recent });
    })
  );

  router.post(
    '/send-sms',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { to, body } = req.body as { to?: string; body?: string };
      if (!to || !body) {
        throw new ValidationError('to and body are required');
      }
      const stack = createSmsStack(config.database);
      if (!stack) {
        throw new InternalError('NOCTUSOFT_API_KEY not configured');
      }
      const result = await stack.guardedSender.sendTransactional(to, body, {
        templateName: 'dev_test_send',
        triggeredBy: 'system',
      });
      res.json({ success: true, messageSid: result.messageId });
    })
  );

  router.get('/twilio-config', (_req: Request, res: Response): void => {
    const hasKey = Boolean(process.env['NOCTUSOFT_API_KEY']);
    const hasInbound = Boolean(process.env['RELAY_INBOUND_SECRET']);
    res.json({
      configured: {
        NOCTUSOFT_API_KEY: hasKey,
        RELAY_INBOUND_SECRET: hasInbound,
      },
      ready: hasKey,
    });
  });

  return router;
}
