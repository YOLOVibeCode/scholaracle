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

  /**
   * Record a token id as revoked until `expiresAt`. Telling it about the same id again is
   * fine (there is one record per id), and the record keeps the later of the expiry times
   * it was given, so a second call can never bring a revoked token back early.
   */
  public async revoke(jti: string, expiresAt: Date): Promise<void> {
    await this._collection.updateOne(
      { jti },
      { $max: { expiresAt }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }

  public async isRevoked(jti: string): Promise<boolean> {
    const doc = await this._collection.findOne({
      jti,
      expiresAt: { $gt: new Date() },
    });
    return doc != null;
  }
}
