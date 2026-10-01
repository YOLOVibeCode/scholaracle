import type { Collection, Db } from 'mongodb';
import type { ISmsConsentRecord } from '@scholaracle/contracts';
import type { ISmsConsentReader, ISmsConsentWriter } from '@scholaracle/interfaces';

const COLLECTION = 'sms_consents';

type ISmsConsentDoc = ISmsConsentRecord & { _id?: unknown };

/**
 * Persists SMS opt-in/opt-out per phone and purpose (toll-free compliance).
 */
export class SmsConsentRepository implements ISmsConsentReader, ISmsConsentWriter {
  private readonly _collection: Collection<ISmsConsentDoc>;

  constructor(database: Db) {
    this._collection = database.collection<ISmsConsentDoc>(COLLECTION);
  }

  public async ensureIndexes(): Promise<void> {
    await this._collection.createIndex({ phoneE164: 1, purpose: 1 }, { unique: true });
  }

  public async findByPhoneAndPurpose(
    phoneE164: string,
    purpose: string
  ): Promise<ISmsConsentRecord | null> {
    const doc = await this._collection.findOne({ phoneE164, purpose });
    return doc ? this._toRecord(doc) : null;
  }

  public async hasActiveConsent(phoneE164: string, purpose: string): Promise<boolean> {
    const doc = await this._collection.findOne({ phoneE164, purpose });
    if (!doc?.consentedAt) {
      return false;
    }
    if (doc.revokedAt) {
      return false;
    }
    return true;
  }

  public async recordOptIn(params: {
    phoneE164: string;
    purpose: string;
    consentTextVersion: string;
    source: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<ISmsConsentRecord> {
    const now = new Date();
    await this._collection.updateOne(
      { phoneE164: params.phoneE164, purpose: params.purpose },
      {
        $set: {
          phoneE164: params.phoneE164,
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
    const doc = await this._collection.findOne({
      phoneE164: params.phoneE164,
      purpose: params.purpose,
    });
    if (!doc) {
      throw new Error('Failed to persist SMS consent');
    }
    return this._toRecord(doc);
  }

  public async recordOptOut(phoneE164: string, purpose: string): Promise<void> {
    const now = new Date();
    await this._collection.updateOne(
      { phoneE164, purpose },
      {
        $set: { revokedAt: now, updatedAt: now },
        $setOnInsert: { phoneE164, purpose, createdAt: now },
      },
      { upsert: true }
    );
  }

  public async clearOptOut(phoneE164: string, purpose: string): Promise<void> {
    const now = new Date();
    await this._collection.updateOne(
      { phoneE164, purpose },
      { $unset: { revokedAt: '' }, $set: { updatedAt: now } }
    );
  }

  public async markConfirmationSent(phoneE164: string, purpose: string): Promise<void> {
    const now = new Date();
    await this._collection.updateOne(
      { phoneE164, purpose },
      {
        $set: { confirmationSentAt: now, updatedAt: now },
        $setOnInsert: { phoneE164, purpose, createdAt: now },
      },
      { upsert: true }
    );
  }

  public async completeReplyYes(phoneE164: string, purpose: string): Promise<void> {
    const now = new Date();
    await this._collection.updateOne(
      { phoneE164, purpose },
      {
        $set: {
          consentedAt: now,
          source: 'reply-yes',
          updatedAt: now,
        },
        $unset: { revokedAt: '' },
        $setOnInsert: { phoneE164, purpose, createdAt: now },
      },
      { upsert: true }
    );
  }

  private _toRecord(doc: ISmsConsentDoc): ISmsConsentRecord {
    return {
      phoneE164: doc.phoneE164,
      purpose: doc.purpose,
      consentTextVersion: doc.consentTextVersion ?? '',
      source: doc.source ?? '',
      ipAddress: doc.ipAddress,
      userAgent: doc.userAgent,
      consentedAt: doc.consentedAt,
      revokedAt: doc.revokedAt,
      confirmationSentAt: doc.confirmationSentAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
