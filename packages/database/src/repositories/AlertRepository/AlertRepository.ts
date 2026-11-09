import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import type {
  IAlertReader,
  IAlertWriter,
  IAlertData,
  IAlertVisibilityScope,
} from '@scholaracle/interfaces';

/**
 * Repository for Alert model operations.
 * Implements IAlertReader and IAlertWriter interfaces following ISP.
 */
export class AlertRepository implements IAlertReader, IAlertWriter {
  private readonly _collection: Collection<IAlertData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IAlertData & { _id?: ObjectId }>('alerts');
  }

  /**
   * Find all alerts for a specific user.
   *
   * @param userId - User ID
   * @returns Array of alerts with IDs
   */
  public async findByUserId(userId: string): Promise<readonly (IAlertData & { id?: string })[]> {
    const documents = await this._collection.find({ userId }).toArray();

    return documents.map((doc) => this._toAlertData(doc));
  }

  /**
   * Find every alert the viewer may see: rows carrying their own `userId` (legacy owner rows)
   * plus, per accessible student, rows carrying that student's owner and one of its ids.
   * Scoping by owner keeps a portal student id from matching another family's rows.
   *
   * @param viewerUserId - The caller
   * @param scopes - Students the caller can access
   * @returns Alerts newest first
   */
  public async findVisibleTo(
    viewerUserId: string,
    scopes: readonly IAlertVisibilityScope[]
  ): Promise<readonly (IAlertData & { id?: string })[]> {
    const clauses: Record<string, unknown>[] = [{ userId: viewerUserId }];
    for (const scope of scopes) {
      if (scope.studentIds.length === 0) continue;
      clauses.push({ userId: scope.ownerUserId, studentId: { $in: [...scope.studentIds] } });
    }
    const documents = await this._collection
      .find({ $or: clauses })
      .sort({ createdAt: -1 })
      .toArray();
    return documents.map((doc) => this._toAlertData(doc));
  }

  /**
   * Find the alerts of one student: rows carrying that student's owner and one of its ids.
   *
   * @param scope - The student's owner and ids
   * @returns Alerts newest first
   */
  public async findByStudentScope(
    scope: IAlertVisibilityScope
  ): Promise<readonly (IAlertData & { id?: string })[]> {
    if (scope.studentIds.length === 0) return [];
    const documents = await this._collection
      .find({ userId: scope.ownerUserId, studentId: { $in: [...scope.studentIds] } })
      .sort({ createdAt: -1 })
      .toArray();
    return documents.map((doc) => this._toAlertData(doc));
  }

  /**
   * Find alert by ID.
   *
   * @param id - Alert ID
   * @returns Alert with ID or null if not found
   */
  public async findById(id: string): Promise<(IAlertData & { id?: string }) | null> {
    const objectId = new ObjectId(id);
    const document = await this._collection.findOne({ _id: objectId });

    if (!document) {
      return null;
    }

    return this._toAlertData(document);
  }

  /**
   * Create a new alert.
   *
   * @param alert - Alert data
   * @returns Created alert with ID
   */
  public async create(alert: IAlertData): Promise<IAlertData & { id?: string }> {
    const now = new Date();
    const document = {
      ...alert,
      acknowledged: alert.acknowledged ?? false,
      createdAt: alert.createdAt ?? now,
    };

    const result = await this._collection.insertOne(document);

    return {
      ...document,
      id: result.insertedId.toString(),
    };
  }

  /**
   * Acknowledge an alert.
   *
   * @param id - Alert ID
   * @returns True if acknowledged, false if not found
   */
  public async acknowledge(id: string): Promise<boolean> {
    const objectId = new ObjectId(id);
    const result = await this._collection.findOneAndUpdate(
      { _id: objectId },
      {
        $set: {
          acknowledged: true,
          acknowledgedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    );

    return result !== null;
  }

  /**
   * Acknowledge an alert for one person (sharing-spec §4.5: acknowledgement is per person).
   * The legacy `acknowledged` / `acknowledgedAt` fields follow the owner only.
   *
   * @param id - Alert ID
   * @param userId - The person acknowledging
   * @param ownerUserId - The alert's owner
   * @returns True if acknowledged, false if not found
   */
  public async acknowledgeFor(id: string, userId: string, ownerUserId: string): Promise<boolean> {
    const objectId = new ObjectId(id);
    const now = new Date();
    const set: Record<string, unknown> = { [`acknowledgedBy.${userId}`]: now.toISOString() };
    if (userId === ownerUserId) {
      set['acknowledged'] = true;
      set['acknowledgedAt'] = now;
    }
    const result = await this._collection.findOneAndUpdate(
      { _id: objectId },
      { $set: set },
      { returnDocument: 'after' }
    );
    return result !== null;
  }

  /**
   * Delete an alert.
   *
   * @param id - Alert ID
   * @returns True if deleted, false if not found
   */
  public async delete(id: string): Promise<boolean> {
    const objectId = new ObjectId(id);
    const result = await this._collection.deleteOne({ _id: objectId });

    return result.deletedCount > 0;
  }

  /**
   * Convert MongoDB document to IAlertData with ID.
   *
   * @param doc - MongoDB document
   * @returns Alert data with ID
   */
  private _toAlertData(doc: IAlertData & { _id?: ObjectId }): IAlertData & { id?: string } {
    return {
      ...doc,
      id: doc._id?.toString(),
    };
  }
}
