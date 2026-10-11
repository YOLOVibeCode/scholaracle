import { randomBytes } from 'node:crypto';
import type { Collection, Db } from 'mongodb';
import { SMS_CONTACT_OPT_IN_TTL_DAYS, type ISmsContactOptInInvite } from '@scholaracle/contracts';
import type { ISmsContactOptInInviteRepository } from '@scholaracle/interfaces';

const COLLECTION = 'sms_contact_optin_invites';
const DAY_MS = 24 * 60 * 60 * 1000;

type IInviteDoc = ISmsContactOptInInvite & { _id?: unknown };

/**
 * Opt-in links a parent shares with a co-parent. The co-parent consents on the page;
 * nothing is texted to their number before that.
 */
export class SmsContactOptInInviteRepository implements ISmsContactOptInInviteRepository {
  private readonly _collection: Collection<IInviteDoc>;

  constructor(database: Db) {
    this._collection = database.collection<IInviteDoc>(COLLECTION);
  }

  public async ensureIndexes(): Promise<void> {
    await this._collection.createIndex({ token: 1 }, { unique: true });
    await this._collection.createIndex({ studentId: 1, contactEmail: 1, createdAt: -1 });
  }

  public async issue(params: {
    studentId: string;
    contactEmail: string;
    inviterName: string;
    phoneE164?: string;
  }): Promise<ISmsContactOptInInvite> {
    const now = new Date();
    await this._collection.updateMany(
      {
        studentId: params.studentId,
        contactEmail: params.contactEmail,
        usedAt: { $exists: false },
      },
      { $set: { expiresAt: now } }
    );
    const invite: ISmsContactOptInInvite = {
      token: randomBytes(24).toString('hex'),
      studentId: params.studentId,
      contactEmail: params.contactEmail,
      inviterName: params.inviterName,
      ...(params.phoneE164 ? { phoneE164: params.phoneE164 } : {}),
      createdAt: now,
      expiresAt: new Date(now.getTime() + SMS_CONTACT_OPT_IN_TTL_DAYS * DAY_MS),
    };
    await this._collection.insertOne({ ...invite });
    return invite;
  }

  public async findActiveByToken(token: string): Promise<ISmsContactOptInInvite | null> {
    const doc = await this._collection.findOne({
      token,
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    return doc ? this._toInvite(doc) : null;
  }

  public async findLatestForContact(
    studentId: string,
    contactEmail: string
  ): Promise<ISmsContactOptInInvite | null> {
    const doc = await this._collection.findOne(
      { studentId, contactEmail },
      { sort: { createdAt: -1, _id: -1 } }
    );
    return doc ? this._toInvite(doc) : null;
  }

  public async markUsed(token: string, consentedPhoneE164: string): Promise<void> {
    await this._collection.updateOne(
      { token },
      { $set: { usedAt: new Date(), consentedPhoneE164 } }
    );
  }

  private _toInvite(doc: IInviteDoc): ISmsContactOptInInvite {
    return {
      token: doc.token,
      studentId: doc.studentId,
      contactEmail: doc.contactEmail,
      inviterName: doc.inviterName,
      phoneE164: doc.phoneE164,
      createdAt: doc.createdAt,
      expiresAt: doc.expiresAt,
      usedAt: doc.usedAt,
      consentedPhoneE164: doc.consentedPhoneE164,
    };
  }
}
