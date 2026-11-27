import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export interface IRefreshTokenStore {
  create(userId: string, tokenHash: string, familyId: string, expiresAt: Date): Promise<void>;
  findValidByTokenHash(
    tokenHash: string
  ): Promise<{ userId: string; familyId: string; expiresAt: Date } | null>;
  findByTokenHash(
    tokenHash: string
  ): Promise<{ userId: string; familyId: string; revokedAt: Date | null } | null>;
  revokeByTokenHash(tokenHash: string): Promise<void>;
  revokeFamily(familyId: string): Promise<void>;
  /** Ends every token of the user outside one family. Returns how many it ended. */
  revokeAllForUserExcept(userId: string, keepFamilyId: string): Promise<number>;
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
    await this._collection.updateOne({ tokenHash }, { $set: { revokedAt: now } });
  }

  public async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    await this._collection.updateMany({ familyId }, { $set: { revokedAt: now } });
  }

  /**
   * End every refresh token of the user outside one family: "sign out all other devices".
   * It goes by the tokens themselves, so a device is signed out whether or not it has a row
   * in the sessions list.
   */
  public async revokeAllForUserExcept(userId: string, keepFamilyId: string): Promise<number> {
    const result = await this._collection.updateMany(
      {
        userId: new ObjectId(userId),
        familyId: { $ne: keepFamilyId },
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date() } }
    );
    return result.modifiedCount;
  }
}
