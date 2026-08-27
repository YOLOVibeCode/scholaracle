import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export interface IStudentMagicTokenStore {
  create(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  consumeValid(tokenHash: string, now?: Date): Promise<{ readonly userId: string } | null>;
  invalidateUnusedForUser(userId: string): Promise<void>;
}

interface TokenDocument {
  userId: ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  usedAt?: Date;
}

/**
 * One-time student magic-link tokens. Callers must store SHA-256 hashes, never raw tokens.
 */
export class StudentMagicTokenRepository implements IStudentMagicTokenStore {
  private readonly _collection: Collection<TokenDocument>;

  constructor(database: Db) {
    this._collection = database.collection<TokenDocument>('student_magic_tokens');
  }

  public async create(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this._collection.insertOne({
      userId: new ObjectId(userId),
      tokenHash,
      expiresAt,
      createdAt: new Date(),
    });
  }

  public async consumeValid(tokenHash: string, now?: Date): Promise<{ userId: string } | null> {
    const at = now ?? new Date();
    const result = await this._collection.findOneAndUpdate(
      {
        tokenHash,
        expiresAt: { $gt: at },
        usedAt: { $exists: false },
      },
      { $set: { usedAt: at } },
      { returnDocument: 'before' }
    );
    if (!result) {
      return null;
    }
    return { userId: result.userId.toString() };
  }

  public async invalidateUnusedForUser(userId: string): Promise<void> {
    await this._collection.deleteMany({
      userId: new ObjectId(userId),
      usedAt: { $exists: false },
    });
  }
}
