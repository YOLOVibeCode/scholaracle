import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  NotFoundError,
  ValidationError,
  SMS_CONSENT_REQUIRED_MESSAGE,
  SMS_CONTACT_OPT_IN_SOURCE,
  SMS_OPT_IN_CONFIRMATION_MESSAGE,
  SMS_OPT_IN_TEXT_VERSION,
  buildSmsOptInLabelHtml,
  type ISmsContactOptInInvite,
} from '@scholaracle/contracts';
import { normalizePhoneE164, type GuardedSmsSender } from '@scholaracle/agents';
import {
  SmsConsentRepository,
  SmsContactOptInInviteRepository,
  StudentRepository,
} from '@scholaracle/database';
import { asyncHandler } from '../../middleware/asyncHandler';
import { recordSmsOptInFromRequest } from '../../services/sms/recordSmsOptIn';
import { logger } from '../../logger';

export interface ISmsOptInRouterConfig {
  readonly database: Db;
  /** Sends the one confirmation text after consent; optional (skipped when unset). */
  readonly guardedSmsSender?: GuardedSmsSender | null;
}

const EXPIRED_MESSAGE = 'This link has expired or was already used. Ask for a new one.';

async function requireActiveInvite(
  invites: SmsContactOptInInviteRepository,
  token: string | undefined
): Promise<ISmsContactOptInInvite> {
  const invite = token ? await invites.findActiveByToken(token) : null;
  if (!invite) {
    throw new NotFoundError(EXPIRED_MESSAGE);
  }
  return invite;
}

function parseConsentedPhone(body: unknown, invite: ISmsContactOptInInvite): string {
  const { phone, consent } = (body ?? {}) as { phone?: unknown; consent?: unknown };
  if (consent !== true) {
    throw new ValidationError(SMS_CONSENT_REQUIRED_MESSAGE);
  }
  const phoneE164 = typeof phone === 'string' && phone.trim() ? normalizePhoneE164(phone) : null;
  if (!phoneE164) {
    throw new ValidationError('Enter a valid US mobile number.');
  }
  if (invite.phoneE164 && invite.phoneE164 !== phoneE164) {
    throw new ValidationError(
      `Use the number ${invite.inviterName} added for you, or ask them to change it.`
    );
  }
  return phoneE164;
}

async function attachPhoneToContact(
  students: StudentRepository,
  invite: ISmsContactOptInInvite,
  phoneE164: string
): Promise<void> {
  const student = await students.findById(invite.studentId);
  const idx = student?.sharedWith.findIndex((sp) => sp.email === invite.contactEmail) ?? -1;
  if (!student || idx === -1) return;
  const shared = [...student.sharedWith];
  const current = shared[idx]!;
  const channels = current.alertChannels ?? ['email'];
  shared[idx] = {
    ...current,
    phone: current.phone?.trim() ? current.phone : phoneE164,
    alertChannels: channels.includes('sms') ? channels : [...channels, 'sms'],
  };
  await students.update(student._id!, { sharedWith: shared });
}

/**
 * Public co-parent opt-in: GET shows the invite, POST records consent the person gives
 * themselves (unchecked box, their own number). No auth; the token is the credential.
 */
export function smsOptInRouter(config: ISmsOptInRouterConfig): Router {
  const router = Router();
  const invites = new SmsContactOptInInviteRepository(config.database);
  const consents = new SmsConsentRepository(config.database);
  const students = new StudentRepository(config.database);

  router.get(
    '/:token',
    asyncHandler(async (req: Request, res: Response) => {
      const invite = await requireActiveInvite(invites, req.params['token']);
      res.status(200).json({
        inviterName: invite.inviterName,
        numberEnding: invite.phoneE164?.slice(-4),
        consentText: buildSmsOptInLabelHtml(),
        consentTextVersion: SMS_OPT_IN_TEXT_VERSION,
        expiresAt: invite.expiresAt.toISOString(),
      });
    })
  );

  router.post(
    '/:token',
    asyncHandler(async (req: Request, res: Response) => {
      const invite = await requireActiveInvite(invites, req.params['token']);
      const phoneE164 = parseConsentedPhone(req.body, invite);
      await recordSmsOptInFromRequest(consents, req, phoneE164, SMS_CONTACT_OPT_IN_SOURCE);
      await invites.markUsed(invite.token, phoneE164);
      await attachPhoneToContact(students, invite, phoneE164);
      try {
        await config.guardedSmsSender?.sendTransactional(
          phoneE164,
          SMS_OPT_IN_CONFIRMATION_MESSAGE,
          {
            templateName: 'sms_opt_in_confirmation',
            triggeredBy: 'system',
          }
        );
      } catch (err: unknown) {
        logger.warn({ err }, 'opt-in confirmation text failed');
      }
      res.status(200).json({ success: true });
    })
  );

  return router;
}
