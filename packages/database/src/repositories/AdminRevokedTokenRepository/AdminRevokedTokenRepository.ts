import type { Db, Collection } from 'mongodb';

export interface IAdminRevokedTokenStore {
  revoke(jti: string, expiresAt: Date): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
}

interface RevokedDocument {
  jti: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Repository for revoked admin JWT tokens (logout blacklist).
 * TTL index on expiresAt allows automatic cleanup.
 */
export class AdminRevokedTokenRepository implements IAdminRevokedTokenStore {
  private readonly _collection: Collection<RevokedDocument>;

  constructor(database: Db) {
    this._collection = database.collection<RevokedDocument>('admin_revoked_tokens');
  }

  public async revoke(jti: string, expiresAt: Date): Promise<void> {
    const now = new Date();
    await this._collection.insertOne({
      jti,
      expiresAt,
      createdAt: now,
    });
  }

  public async isRevoked(jti: string): Promise<boolean> {
    const doc = await this._collection.findOne({
      jti,
      expiresAt: { $gt: new Date() },
    });
    return doc != null;
  }
}
