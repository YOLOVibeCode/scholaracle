import { Router } from 'express';
import express from 'express';
import type { Db } from 'mongodb';
import { SMS_INBOUND_WEBHOOK_URL, SMS_STATUS_WEBHOOK_URL } from '@scholaracle/contracts';
import { handleInboundSms, handleStatusCallback } from './twilio-webhook.handlers';
import { requireRelayInboundSignature } from './relay-signature.middleware';

export interface ITwilioWebhookRouterConfig {
  readonly database: Db;
  readonly relayInboundSecret?: string;
  readonly smsWebhookPublicUrl?: string;
  readonly statusWebhookPublicUrl?: string;
}

function captureRawUrlencoded(): express.RequestHandler {
  return express.urlencoded({
    extended: false,
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: string }).rawBody = buf.toString('utf8');
    },
  });
}

/**
 * Twilio webhook router (relay-forwarded inbound SMS + status).
 */
export function twilioWebhookRouter(config: ITwilioWebhookRouterConfig): Router {
  const router = Router();
  const secret = config.relayInboundSecret ?? process.env['RELAY_INBOUND_SECRET'] ?? '';
  const smsUrl = config.smsWebhookPublicUrl ?? SMS_INBOUND_WEBHOOK_URL;
  const statusUrl = config.statusWebhookPublicUrl ?? SMS_STATUS_WEBHOOK_URL;

  router.post(
    '/sms',
    captureRawUrlencoded(),
    requireRelayInboundSignature({ publicUrl: smsUrl, secret }),
    handleInboundSms(config.database)
  );
  router.post(
    '/status',
    captureRawUrlencoded(),
    requireRelayInboundSignature({ publicUrl: statusUrl, secret }),
    handleStatusCallback(config.database)
  );

  return router;
}
