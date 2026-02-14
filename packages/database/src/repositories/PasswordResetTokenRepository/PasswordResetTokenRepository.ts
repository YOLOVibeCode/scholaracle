import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export interface IPasswordResetTokenStore {
  create(userId: string, token: string, expiresAt: Date): Promise<void>;
  findValidByToken(token: string): Promise<{ readonly userId: string } | null>;
  invalidateForUser(userId: string): Promise<void>;
}

interface TokenDocument {
  userId: ObjectId;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Repository for password reset tokens. Implements IPasswordResetTokenStore.
 */
export class PasswordResetTokenRepository implements IPasswordResetTokenStore {
  private readonly _collection: Collection<TokenDocument>;

  constructor(database: Db) {
    this._collection = database.collection<TokenDocument>('password_reset_tokens');
  }

  public async create(userId: string, token: string, expiresAt: Date): Promise<void> {
    const now = new Date();
    await this._collection.insertOne({
      userId: new ObjectId(userId),
      token,
      expiresAt,
      createdAt: now,
    });
  }

  public async findValidByToken(token: string): Promise<{ userId: string } | null> {
    const doc = await this._collection.findOne({
      token,
      expiresAt: { $gt: new Date() },
    });
    if (!doc) return null;
    return { userId: doc.userId.toString() };
  }

  public async invalidateForUser(userId: string): Promise<void> {
    await this._collection.deleteMany({ userId: new ObjectId(userId) });
  }
}
