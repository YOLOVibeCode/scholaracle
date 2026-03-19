import type { Db, Collection } from 'mongodb';
import type { ObjectId } from 'mongodb';

export interface IEmailDigestPendingItem {
  readonly userId: string;
  readonly recipientEmail: string;
  readonly alertType: string;
  readonly severity: string;
  readonly subject: string;
  readonly body: string;
  readonly studentName?: string;
  readonly courseName?: string;
  readonly assignmentTitle?: string;
  readonly dashboardUrl?: string;
  /** When set, digest tone is adjusted for parent vs student. */
  readonly recipientType?: 'parent' | 'student';
  /** Deep-link fields for clickable email content. */
  readonly studentId?: string;
  readonly courseExternalId?: string;
  readonly assignmentExternalId?: string;
  readonly createdAt: Date;
  /** When true, the email is generated and stored in history but not actually sent. */
  readonly preview?: boolean;
}

const COLLECTION_NAME = 'email_digest_pending';

/**
 * Repository for pending email digest items. Used to batch alert emails into one daily message per recipient.
 */
export class EmailDigestPendingRepository {
  private readonly _collection: Collection<IEmailDigestPendingItem & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IEmailDigestPendingItem & { _id?: ObjectId }>(
      COLLECTION_NAME
    );
  }

  /** Append one alert to a recipient's digest queue. */
  async add(item: IEmailDigestPendingItem): Promise<void> {
    await this._collection.insertOne({
      ...item,
      createdAt: item.createdAt ?? new Date(),
    });
  }

  /** Get all pending items for a user (one per alert), ordered by createdAt. */
  async findByUserId(userId: string): Promise<readonly IEmailDigestPendingItem[]> {
    const docs = await this._collection.find({ userId }).sort({ createdAt: 1 }).toArray();
    return docs.map((d) => ({
      userId: d.userId,
      recipientEmail: d.recipientEmail,
      alertType: d.alertType,
      severity: d.severity,
      subject: d.subject,
      body: d.body,
      studentName: d.studentName,
      courseName: d.courseName,
      assignmentTitle: d.assignmentTitle,
      dashboardUrl: d.dashboardUrl,
      recipientType: d.recipientType,
      studentId: d.studentId,
      courseExternalId: d.courseExternalId,
      assignmentExternalId: d.assignmentExternalId,
      createdAt: d.createdAt,
      preview: d.preview,
    }));
  }

  /** Remove all pending items for a user after sending the digest. */
  async deleteByUserId(userId: string): Promise<number> {
    const result = await this._collection.deleteMany({ userId });
    return result.deletedCount;
  }

  /** Get distinct userIds that have pending items (for digest flush job). */
  async getDistinctUserIds(): Promise<string[]> {
    const ids = await this._collection.distinct('userId', {});
    return ids as string[];
  }
}
