import type { IServerAiConsentRecord } from '@scholaracle/contracts';

export interface IServerAiConsentReader {
  findByUserAndPurpose(userId: string, purpose: string): Promise<IServerAiConsentRecord | null>;
  hasActiveConsent(userId: string, purpose: string): Promise<boolean>;
}

export interface IServerAiConsentWriter {
  recordOptIn(params: {
    userId: string;
    purpose: string;
    consentTextVersion: string;
    source: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<IServerAiConsentRecord>;
  recordRevoke(userId: string, purpose: string): Promise<void>;
}

export interface IServerAiConsentRepository
  extends IServerAiConsentReader, IServerAiConsentWriter {}
