import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { IPasswordResetTokenStore } from '../PasswordResetTokenRepository/PasswordResetTokenRepository';

interface TokenDocument {
  userId: ObjectId;
  token: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Repository for admin password reset tokens. Same interface as parent reset tokens
 * but uses collection admin_password_reset_tokens (userId is adminId).
 */
export class AdminPasswordResetTokenRepository implements IPasswordResetTokenStore {
  private readonly _collection: Collection<TokenDocument>;

  constructor(database: Db) {
    this._collection = database.collection<TokenDocument>('admin_password_reset_tokens');
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
