import type { ISmsConsentRecord } from '@scholaracle/contracts';

export interface ISmsConsentReader {
  findByPhoneAndPurpose(phoneE164: string, purpose: string): Promise<ISmsConsentRecord | null>;
  hasActiveConsent(phoneE164: string, purpose: string): Promise<boolean>;
}

export interface ISmsConsentWriter {
  recordOptIn(params: {
    phoneE164: string;
    purpose: string;
    consentTextVersion: string;
    source: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ISmsConsentRecord>;
  recordOptOut(phoneE164: string, purpose: string): Promise<void>;
  clearOptOut(phoneE164: string, purpose: string): Promise<void>;
  markConfirmationSent(phoneE164: string, purpose: string): Promise<void>;
  completeReplyYes(phoneE164: string, purpose: string): Promise<void>;
}

export interface ISmsConsentRepository extends ISmsConsentReader, ISmsConsentWriter {}
