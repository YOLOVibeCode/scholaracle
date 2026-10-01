import type { Request, Response } from 'express';
import type { Db } from 'mongodb';
import {
  CommunicationLogRepository,
  SmsConsentRepository,
  type CommunicationStatus,
} from '@scholaracle/database';
import {
  SCHOLARMANCY_SMS_HELP_LINE,
  SCHOLARMANCY_SMS_PURPOSE,
  SCHOLARMANCY_SMS_SUPPORT_EMAIL,
} from '@scholaracle/contracts';
import { normalizePhoneE164 } from '@scholaracle/agents';

const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'stopall',
  'unsubscribe',
  'cancel',
  'end',
  'quit',
  'revoke',
  'optout',
]);
const OPT_IN_KEYWORDS = new Set(['start', 'unstop']);
const HELP_KEYWORDS = new Set(['help', 'info']);

interface ITwilioSmsBody {
  readonly MessageSid?: string;
  readonly From?: string;
  readonly To?: string;
  readonly Body?: string;
  readonly OptOutType?: string;
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

function normalizeFromPhone(from: string): string {
  try {
    return normalizePhoneE164(from);
  } catch {
    return from.trim();
  }
}

function buildHelpTwiml(): string {
  const text =
    `${SCHOLARMANCY_SMS_HELP_LINE} Help: ${SCHOLARMANCY_SMS_SUPPORT_EMAIL}. ` +
    'Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<Response><Message>${escaped}</Message></Response>`;
}

/**
 * Handle inbound SMS from the relay (STOP/START/HELP/YES).
 */
export function handleInboundSms(database: Db): (req: Request, res: Response) => Promise<void> {
  const consentRepo = new SmsConsentRepository(database);

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as ITwilioSmsBody;
      const fromRaw = body.From ?? '';
      const phoneE164 = normalizeFromPhone(fromRaw);
      const messageBody = (body.Body ?? '').trim();
      const keyword = messageBody.toLowerCase();
      const optOutType = (body.OptOutType ?? '').toUpperCase();

      const isStop = OPT_OUT_KEYWORDS.has(keyword) || optOutType === 'STOP';
      const isStart = OPT_IN_KEYWORDS.has(keyword) || optOutType === 'START';
      const isHelp = HELP_KEYWORDS.has(keyword) || optOutType === 'HELP';
      const isYes = keyword === 'yes';

      if (isStop) {
        await consentRepo.recordOptOut(phoneE164, SCHOLARMANCY_SMS_PURPOSE);
        res.type('text/xml').send('<Response></Response>');
        return;
      }

      if (isStart) {
        await consentRepo.clearOptOut(phoneE164, SCHOLARMANCY_SMS_PURPOSE);
        res.type('text/xml').send('<Response></Response>');
        return;
      }

      if (isHelp) {
        res.type('text/xml').send(buildHelpTwiml());
        return;
      }

      if (isYes) {
        await consentRepo.completeReplyYes(phoneE164, SCHOLARMANCY_SMS_PURPOSE);
        res.type('text/xml').send('<Response></Response>');
        return;
      }

      res.type('text/xml').send('<Response></Response>');
    } catch {
      res.type('text/xml').send('<Response></Response>');
    }
  };
}

/**
 * Handle delivery status callbacks; map status and record 21610 opt-outs.
 */
export function handleStatusCallback(database: Db): (req: Request, res: Response) => Promise<void> {
  const commLogRepo = new CommunicationLogRepository(database);
  const consentRepo = new SmsConsentRepository(database);

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

      if (body.ErrorCode === '21610' && body.To) {
        const phoneE164 = normalizeFromPhone(body.To);
        await consentRepo.recordOptOut(phoneE164, SCHOLARMANCY_SMS_PURPOSE);
      }

      res.status(200).json({ success: true });
    } catch {
      res.status(200).json({ success: true });
    }
  };
}
