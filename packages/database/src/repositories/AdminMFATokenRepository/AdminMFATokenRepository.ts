import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export interface IAdminMFATokenStore {
  create(mfaToken: string, adminId: string, secret: string, expiresAt: Date): Promise<void>;
  get(mfaToken: string): Promise<{ adminId: string; secret: string } | null>;
  delete(mfaToken: string): Promise<void>;
}

interface MFADocument {
  mfaToken: string;
  adminId: ObjectId;
  secret: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Repository for admin MFA pending tokens (post-login, pre-TOTP verify).
 * TTL index on expiresAt allows automatic cleanup.
 */
export class AdminMFATokenRepository implements IAdminMFATokenStore {
  private readonly _collection: Collection<MFADocument>;

  constructor(database: Db) {
    this._collection = database.collection<MFADocument>('admin_mfa_tokens');
  }

  public async create(
    mfaToken: string,
    adminId: string,
    secret: string,
    expiresAt: Date
  ): Promise<void> {
    const now = new Date();
    await this._collection.insertOne({
      mfaToken,
      adminId: new ObjectId(adminId),
      secret,
      expiresAt,
      createdAt: now,
    });
  }

  public async get(mfaToken: string): Promise<{ adminId: string; secret: string } | null> {
    const doc = await this._collection.findOne({
      mfaToken,
      expiresAt: { $gt: new Date() },
    });
    if (!doc) return null;
    return {
      adminId: doc.adminId.toString(),
      secret: doc.secret,
    };
  }

  public async delete(mfaToken: string): Promise<void> {
    await this._collection.deleteOne({ mfaToken });
  }
}
