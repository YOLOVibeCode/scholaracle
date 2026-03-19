import { Router } from 'express';
import type { Db } from 'mongodb';
import { handleInboundSms } from './twilio-webhook.handlers';
import { handleStatusCallback } from './twilio-webhook.handlers';
import { requireTwilioSignature } from './twilio-signature.middleware';

export interface ITwilioWebhookRouterConfig {
  readonly database: Db;
  readonly twilioAuthToken?: string;
}

/**
 * Twilio webhook router.
 * Mounts at /api/webhooks/twilio — receives inbound SMS and delivery status callbacks.
 */
export function twilioWebhookRouter(config: ITwilioWebhookRouterConfig): Router {
  const router = Router();
  const authToken = config.twilioAuthToken ?? process.env['TWILIO_AUTH_TOKEN'] ?? '';
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';

  if (nodeEnv === 'production' && authToken) {
    router.use(requireTwilioSignature(authToken));
  }

  router.post('/sms', handleInboundSms(config.database));
  router.post('/status', handleStatusCallback(config.database));

  return router;
}
