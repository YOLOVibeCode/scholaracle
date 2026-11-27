import type { Db } from 'mongodb';
import { CommunicationLogRepository, SmsConsentRepository } from '@scholaracle/database';
import { SMSDelivery } from '../delivery/SMSDelivery/SMSDelivery';
import { GuardedSmsSender } from './GuardedSmsSender';
import { NoctusoftSmsRelayClient } from './NoctusoftSmsRelayClient';
import { resolveSmsAppEnv, type SmsAppEnv } from './smsAppEnv';

export interface ISmsStack {
  readonly guardedSender: GuardedSmsSender;
  readonly smsDelivery: SMSDelivery;
  readonly consentRepository: SmsConsentRepository;
  /** What the relay does with every text from this process: send it, or capture it (`dev`). */
  readonly appEnv: SmsAppEnv;
}

/**
 * Builds relay + consent + guarded SMS delivery when NOCTUSOFT_API_KEY is set. Without the
 * key it returns null and nothing in the process can send a text.
 *
 * Every text carries the environment it comes from (`resolveSmsAppEnv`), so only the
 * production environment reaches a phone.
 */
export function createSmsStack(
  database: Db,
  apiKey?: string,
  env: Readonly<Record<string, string | undefined>> = process.env
): ISmsStack | null {
  const key = apiKey ?? env['NOCTUSOFT_API_KEY'] ?? '';
  if (!key) {
    return null;
  }
  const appEnv = resolveSmsAppEnv(env);
  const consentRepository = new SmsConsentRepository(database);
  const commLogs = new CommunicationLogRepository(database);
  const relay = new NoctusoftSmsRelayClient(key, { appEnv });
  const guardedSender = new GuardedSmsSender(relay, consentRepository, commLogs);
  const smsDelivery = new SMSDelivery(guardedSender);
  return { guardedSender, smsDelivery, consentRepository, appEnv };
}

/** The line a service logs at start, so the log says whether texts can go out and how. */
export function describeSmsStack(stack: ISmsStack | null): {
  readonly texts: 'off' | SmsAppEnv;
  readonly message: string;
} {
  if (stack === null) {
    return { texts: 'off', message: 'texts are off: NOCTUSOFT_API_KEY is not set' };
  }
  if (stack.appEnv === 'dev') {
    return { texts: 'dev', message: 'texts are on: the relay captures them, none is sent' };
  }
  return { texts: stack.appEnv, message: 'texts are on: they are sent' };
}
