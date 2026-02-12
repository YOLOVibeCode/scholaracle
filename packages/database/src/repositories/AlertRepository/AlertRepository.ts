import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { IAlertReader, IAlertWriter, IAlertData } from '@scholaracle/interfaces';

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
