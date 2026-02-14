import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export interface IRefreshTokenStore {
  create(
    userId: string,
    tokenHash: string,
    familyId: string,
    expiresAt: Date
  ): Promise<void>;
  findValidByTokenHash(
    tokenHash: string
  ): Promise<{ userId: string; familyId: string; expiresAt: Date } | null>;
  findByTokenHash(
    tokenHash: string
  ): Promise<{ userId: string; familyId: string; revokedAt: Date | null } | null>;
  revokeByTokenHash(tokenHash: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
}

interface TokenDocument {
  userId: ObjectId;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  revokedAt?: Date;
  createdAt: Date;
}

/**
 * Repository for refresh tokens. Stores hashed tokens with family IDs for rotation.
 * Implements IRefreshTokenStore.
 */
export class RefreshTokenRepository implements IRefreshTokenStore {
  private readonly _collection: Collection<TokenDocument>;

  constructor(database: Db) {
    this._collection = database.collection<TokenDocument>('refresh_tokens');
  }

  public async create(
    userId: string,
    tokenHash: string,
    familyId: string,
    expiresAt: Date
  ): Promise<void> {
    const now = new Date();
    await this._collection.insertOne({
      userId: new ObjectId(userId),
      tokenHash,
      familyId,
      expiresAt,
      createdAt: now,
    });
  }

  public async findValidByTokenHash(
    tokenHash: string
  ): Promise<{ userId: string; familyId: string; expiresAt: Date } | null> {
    const doc = await this._collection.findOne({
      tokenHash,
      expiresAt: { $gt: new Date() },
    });
    if (!doc || doc.revokedAt != null) return null;
    return {
      userId: doc.userId.toString(),
      familyId: doc.familyId,
      expiresAt: doc.expiresAt,
    };
  }

  public async findByTokenHash(
    tokenHash: string
  ): Promise<{ userId: string; familyId: string; revokedAt: Date | null } | null> {
    const doc = await this._collection.findOne({
      tokenHash,
    });
    if (!doc) return null;
    return {
      userId: doc.userId.toString(),
      familyId: doc.familyId,
      revokedAt: doc.revokedAt ?? null,
    };
  }

  public async revokeByTokenHash(tokenHash: string): Promise<void> {
    const now = new Date();
    await this._collection.updateOne(
      { tokenHash },
      { $set: { revokedAt: now } }
    );
  }

  public async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    await this._collection.updateMany(
      { familyId },
      { $set: { revokedAt: now } }
    );
  }
}
