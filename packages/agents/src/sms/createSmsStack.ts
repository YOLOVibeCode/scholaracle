import type { Db } from 'mongodb';
import { CommunicationLogRepository, SmsConsentRepository } from '@scholaracle/database';
import { SMSDelivery } from '../delivery/SMSDelivery/SMSDelivery';
import { GuardedSmsSender } from './GuardedSmsSender';
import { NoctusoftSmsRelayClient } from './NoctusoftSmsRelayClient';

export interface ISmsStack {
  readonly guardedSender: GuardedSmsSender;
  readonly smsDelivery: SMSDelivery;
  readonly consentRepository: SmsConsentRepository;
}

/** Builds relay + consent + guarded SMS delivery when NOCTUSOFT_API_KEY is set. */
export function createSmsStack(database: Db, apiKey?: string): ISmsStack | null {
  const key = apiKey ?? process.env['NOCTUSOFT_API_KEY'] ?? '';
  if (!key) {
    return null;
  }
  const consentRepository = new SmsConsentRepository(database);
  const commLogs = new CommunicationLogRepository(database);
  const relay = new NoctusoftSmsRelayClient(key);
  const guardedSender = new GuardedSmsSender(relay, consentRepository, commLogs);
  const smsDelivery = new SMSDelivery(guardedSender);
  return { guardedSender, smsDelivery, consentRepository };
}
