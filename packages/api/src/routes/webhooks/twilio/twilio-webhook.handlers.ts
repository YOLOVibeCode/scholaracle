import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import {
  CommunicationLogRepository,
  AuditLogRepository,
  type CommunicationStatus,
} from '@scholaracle/database';

const OPT_OUT_KEYWORDS = new Set(['stop', 'stopall', 'unsubscribe', 'cancel', 'end', 'quit']);
const OPT_IN_KEYWORDS = new Set(['start', 'yes', 'unstop']);

interface ITwilioSmsBody {
  readonly MessageSid?: string;
  readonly From?: string;
  readonly To?: string;
  readonly Body?: string;
  readonly NumMedia?: string;
}

interface ITwilioStatusBody {
  readonly MessageSid?: string;
  readonly MessageStatus?: string;
  readonly To?: string;
  readonly From?: string;
  readonly ErrorCode?: string;
  readonly ErrorMessage?: string;
}

const TWILIO_STATUS_MAP: Record<string, CommunicationStatus> = {
  queued: 'pending',
  sent: 'sent',
  delivered: 'delivered',
  undelivered: 'failed',
  failed: 'failed',
};

/**
 * Handle inbound SMS from Twilio.
 * Processes opt-out/opt-in keywords (STOP/START) and logs inbound messages.
 */
export function handleInboundSms(database: Db): (req: Request, res: Response) => Promise<void> {
  const auditRepo = new AuditLogRepository(database);

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as ITwilioSmsBody;
      const from = body.From ?? '';
      const messageBody = (body.Body ?? '').trim();
      const keyword = messageBody.toLowerCase();

      if (OPT_OUT_KEYWORDS.has(keyword)) {
        await auditRepo.create({
          adminUserId: 'system',
          adminEmail: 'system@twilio-webhook',
          action: 'system:config_change',
          entityType: 'sms_opt_out',
          entityId: from,
          reason: `Opt-out received: "${messageBody}"`,
          metadata: { phone: from, keyword, messageSid: body.MessageSid },
          ipAddress: req.ip ?? 'unknown',
          userAgent: 'twilio-webhook',
        });
        res
          .type('text/xml')
          .send(
            '<Response><Message>You have been unsubscribed from Scholaracle notifications. Reply START to re-subscribe.</Message></Response>'
          );
        return;
      }

      if (OPT_IN_KEYWORDS.has(keyword)) {
        await auditRepo.create({
          adminUserId: 'system',
          adminEmail: 'system@twilio-webhook',
          action: 'system:config_change',
          entityType: 'sms_opt_in',
          entityId: from,
          reason: `Opt-in received: "${messageBody}"`,
          metadata: { phone: from, keyword, messageSid: body.MessageSid },
          ipAddress: req.ip ?? 'unknown',
          userAgent: 'twilio-webhook',
        });
        res
          .type('text/xml')
          .send(
            '<Response><Message>You have been re-subscribed to Scholaracle notifications.</Message></Response>'
          );
        return;
      }

      // Non-keyword inbound SMS — acknowledge without reply
      res.type('text/xml').send('<Response></Response>');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[TwilioWebhook] Inbound SMS error:', error);
      res.type('text/xml').send('<Response></Response>');
    }
  };
}

/**
 * Handle delivery status callbacks from Twilio.
 * Maps Twilio statuses (queued/sent/delivered/failed) to internal CommunicationStatus
 * and updates the matching communication log entry.
 */
export function handleStatusCallback(database: Db): (req: Request, res: Response) => Promise<void> {
  const commLogRepo = new CommunicationLogRepository(database);

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as ITwilioStatusBody;
      const messageSid = body.MessageSid ?? '';
      const twilioStatus = body.MessageStatus ?? '';

      if (!messageSid || !twilioStatus) {
        res.status(400).json({ error: 'MessageSid and MessageStatus are required' });
        return;
      }

      const internalStatus = TWILIO_STATUS_MAP[twilioStatus];
      if (internalStatus) {
        await commLogRepo.updateDeliveryStatusByProviderId(messageSid, internalStatus);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[TwilioWebhook] Status callback error:', error);
      res.status(200).json({ success: true });
    }
  };
}
