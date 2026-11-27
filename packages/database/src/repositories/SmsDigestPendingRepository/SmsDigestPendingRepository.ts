import type { Db, Collection } from 'mongodb';
import type { ObjectId } from 'mongodb';

export interface ISmsDigestPendingItem {
  readonly userId: string;
  readonly phone: string;
  readonly subject: string;
  readonly body: string;
  readonly createdAt: Date;
}

const COLLECTION_NAME = 'sms_digest_pending';

/**
 * Repository for pending SMS digest items. Used to batch alert SMS into one daily message per user.
 */
export class SmsDigestPendingRepository {
  private readonly _collection: Collection<ISmsDigestPendingItem & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<ISmsDigestPendingItem & { _id?: ObjectId }>(
      COLLECTION_NAME
    );
  }

  /** Append one alert to a user's digest queue. */
  async add(item: ISmsDigestPendingItem): Promise<void> {
    await this._collection.insertOne({
      ...item,
      createdAt: item.createdAt ?? new Date(),
    });
  }

  /** Get all pending items for a user (one per alert). */
  async findByUserId(userId: string): Promise<readonly ISmsDigestPendingItem[]> {
    const docs = await this._collection.find({ userId }).sort({ createdAt: 1 }).toArray();
    return docs.map((d) => ({
      userId: d.userId,
      phone: d.phone,
      subject: d.subject,
      body: d.body,
      createdAt: d.createdAt,
    }));
  }

  /**
   * Remove a user's pending items after their digest is dealt with. With `createdUpTo`,
   * only the items created up to that moment go: one that arrived while the digest was
   * on its way stays for the next digest.
   */
  async deleteByUserId(userId: string, createdUpTo?: Date): Promise<number> {
    const result = await this._collection.deleteMany(
      createdUpTo === undefined ? { userId } : { userId, createdAt: { $lte: createdUpTo } }
    );
    return result.deletedCount;
  }

  /** Get distinct userIds that have pending items (for digest flush job). */
  async getDistinctUserIds(): Promise<string[]> {
    const ids = await this._collection.distinct('userId', {});
    return ids as string[];
  }
}
