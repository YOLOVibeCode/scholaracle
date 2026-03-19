import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { CommunicationLogRepository } from '@scholaracle/database';
import twilio from 'twilio';

export interface ITwilioTestRouterConfig {
  readonly database: Db;
}

/**
 * Test endpoint for Twilio integration debugging.
 * Simulates inbound SMS and status callbacks without Twilio signature validation.
 * ONLY mount in development/staging environments.
 */
export function twilioTestRouter(config: ITwilioTestRouterConfig): Router {
  const router = Router();
  const commLogRepo = new CommunicationLogRepository(config.database);

  // GET /test/simulate-inbound-sms?from=+1234567890&body=STOP
  router.get('/simulate-inbound-sms', async (req: Request, res: Response): Promise<void> => {
    try {
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
        note: 'Send this payload as POST to /api/webhooks/twilio/sms to test inbound handler',
        curl: `curl -X POST https://api.scholarmancy.com/api/webhooks/twilio/sms -H "Content-Type: application/x-www-form-urlencoded" -d "From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}&Body=${encodeURIComponent(body)}&MessageSid=SM_TEST_${Date.now()}"`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /test/simulate-status-callback?messageSid=SM123&status=delivered
  router.get('/simulate-status-callback', async (req: Request, res: Response): Promise<void> => {
    try {
      const messageSid = (req.query['messageSid'] as string) ?? 'SM_TEST_123';
      const status = (req.query['status'] as string) ?? 'delivered';

      res.json({
        success: true,
        simulated: {
          MessageSid: messageSid,
          MessageStatus: status,
        },
        note: 'Send this payload as POST to /api/webhooks/twilio/status to test status callback handler',
        curl: `curl -X POST https://api.scholarmancy.com/api/webhooks/twilio/status -H "Content-Type: application/x-www-form-urlencoded" -d "MessageSid=${messageSid}&MessageStatus=${status}"`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /test/comm-logs?limit=10
  router.get('/comm-logs', async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = parseInt((req.query['limit'] as string) ?? '10', 10);
      const logs = await commLogRepo.filterByChannel('sms');
      const recent = logs.slice(0, limit);

      res.json({
        success: true,
        count: recent.length,
        logs: recent.map((log) => ({
          _id: log._id?.toString(),
          userId: log.userId,
          status: log.status,
          providerId: log.providerId,
          recipientPhone: log.recipientPhone,
          subject: log.subject,
          sentAt: log.sentAt,
          deliveredAt: log.deliveredAt,
          failedAt: log.failedAt,
          createdAt: log.createdAt,
        })),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /test/send-sms (requires Twilio credentials in env)
  router.post('/send-sms', async (req: Request, res: Response): Promise<void> => {
    try {
      const { to, body } = req.body as { to?: string; body?: string };

      if (!to || !body) {
        res.status(400).json({ error: 'to and body are required' });
        return;
      }

      const twilioAccountSid = process.env['TWILIO_ACCOUNT_SID'];
      const twilioApiKeySid = process.env['TWILIO_API_KEY_SID'];
      const twilioApiKeySecret = process.env['TWILIO_API_KEY_SECRET'];
      const messagingServiceSid = process.env['TWILIO_MESSAGING_SERVICE_SID'];

      if (!twilioAccountSid || !twilioApiKeySid || !twilioApiKeySecret || !messagingServiceSid) {
        res.status(500).json({ error: 'Twilio credentials not configured' });
        return;
      }

      const client = twilio(twilioApiKeySid, twilioApiKeySecret, {
        accountSid: twilioAccountSid,
      });

      const message = await client.messages.create({
        messagingServiceSid,
        to,
        body,
      });

      res.json({
        success: true,
        messageSid: message.sid,
        status: message.status,
        from: message.from,
        to: message.to,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // GET /test/twilio-config
  router.get('/twilio-config', (_req: Request, res: Response): void => {
    const hasAccountSid = Boolean(process.env['TWILIO_ACCOUNT_SID']);
    const hasApiKey = Boolean(process.env['TWILIO_API_KEY_SID']);
    const hasApiSecret = Boolean(process.env['TWILIO_API_KEY_SECRET']);
    const hasAuthToken = Boolean(process.env['TWILIO_AUTH_TOKEN']);
    const hasFromNumber = Boolean(process.env['TWILIO_FROM_NUMBER']);
    const hasMessagingService = Boolean(process.env['TWILIO_MESSAGING_SERVICE_SID']);

    res.json({
      configured: {
        TWILIO_ACCOUNT_SID: hasAccountSid,
        TWILIO_API_KEY_SID: hasApiKey,
        TWILIO_API_KEY_SECRET: hasApiSecret,
        TWILIO_AUTH_TOKEN: hasAuthToken,
        TWILIO_FROM_NUMBER: hasFromNumber,
        TWILIO_MESSAGING_SERVICE_SID: hasMessagingService,
      },
      values: {
        TWILIO_ACCOUNT_SID: hasAccountSid ? process.env['TWILIO_ACCOUNT_SID'] : null,
        TWILIO_FROM_NUMBER: hasFromNumber ? process.env['TWILIO_FROM_NUMBER'] : null,
        TWILIO_MESSAGING_SERVICE_SID: hasMessagingService
          ? process.env['TWILIO_MESSAGING_SERVICE_SID']
          : null,
      },
      ready: hasAccountSid && hasApiKey && hasApiSecret && hasMessagingService,
    });
  });

  return router;
}
