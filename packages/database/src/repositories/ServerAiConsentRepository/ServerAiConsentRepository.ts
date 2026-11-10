import type { Collection, Db } from 'mongodb';
import type { IServerAiConsentRecord } from '@scholaracle/contracts';
import type { IServerAiConsentReader, IServerAiConsentWriter } from '@scholaracle/interfaces';

const COLLECTION = 'consents';

type IServerAiConsentDoc = IServerAiConsentRecord & { _id?: unknown };

/**
 * Parent opt-in for server-side AI on synced materials (separate from sms_consents).
 */
export class ServerAiConsentRepository implements IServerAiConsentReader, IServerAiConsentWriter {
  private readonly _collection: Collection<IServerAiConsentDoc>;

  constructor(database: Db) {
    this._collection = database.collection<IServerAiConsentDoc>(COLLECTION);
  }

  public async ensureIndexes(): Promise<void> {
    await this._collection.createIndex({ userId: 1, purpose: 1 }, { unique: true });
  }

  public async findByUserAndPurpose(
    userId: string,
    purpose: string
  ): Promise<IServerAiConsentRecord | null> {
    const doc = await this._collection.findOne({ userId, purpose });
    return doc ? this._toRecord(doc) : null;
  }

  public async hasActiveConsent(userId: string, purpose: string): Promise<boolean> {
    const doc = await this._collection.findOne({ userId, purpose });
    if (!doc?.consentedAt) {
      return false;
    }
    if (doc.revokedAt) {
      return false;
    }
    return true;
  }

  public async recordOptIn(params: {
    userId: string;
    purpose: string;
    consentTextVersion: string;
    source: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<IServerAiConsentRecord> {
    const now = new Date();
    await this._collection.updateOne(
      { userId: params.userId, purpose: params.purpose },
      {
        $set: {
          userId: params.userId,
          purpose: params.purpose,
          consentTextVersion: params.consentTextVersion,
          source: params.source,
          ipAddress: params.ipAddress,
          userAgent: params.userAgent,
          consentedAt: now,
          updatedAt: now,
        },
        $unset: { revokedAt: '' },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
    const doc = await this._collection.findOne({ userId: params.userId, purpose: params.purpose });
    if (!doc) {
      throw new Error('Failed to persist server AI consent');
    }
    return this._toRecord(doc);
  }

  public async recordRevoke(userId: string, purpose: string): Promise<void> {
    const now = new Date();
    await this._collection.updateOne(
      { userId, purpose },
      {
        $set: { revokedAt: now, updatedAt: now },
        $setOnInsert: { userId, purpose, createdAt: now },
      },
      { upsert: true }
    );
  }

  private _toRecord(doc: IServerAiConsentDoc): IServerAiConsentRecord {
    return {
      userId: doc.userId,
      purpose: doc.purpose,
      consentTextVersion: doc.consentTextVersion ?? '',
      source: doc.source ?? '',
      ipAddress: doc.ipAddress,
      userAgent: doc.userAgent,
      consentedAt: doc.consentedAt,
      revokedAt: doc.revokedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
