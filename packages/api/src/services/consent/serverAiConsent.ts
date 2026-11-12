import type { Db } from 'mongodb';
import { SERVER_AI_CONSENT_PURPOSE } from '@scholaracle/contracts';
import { ServerAiConsentRepository } from '@scholaracle/database';

export async function hasServerAiConsent(database: Db, userId: string): Promise<boolean> {
  const repo = new ServerAiConsentRepository(database);
  return repo.hasActiveConsent(userId, SERVER_AI_CONSENT_PURPOSE);
}
