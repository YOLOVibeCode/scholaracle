import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

export interface IAdminStepUpChallengeStore {
  create(stepUpId: string, adminId: string, expiresAt: Date): Promise<void>;
  get(stepUpId: string): Promise<{ adminId: string } | null>;
  delete(stepUpId: string): Promise<void>;
}

interface StepUpDocument {
  stepUpId: string;
  adminId: ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Repository for admin step-up MFA challenges (sensitive action re-verification).
 * TTL index on expiresAt allows automatic cleanup.
 */
export class AdminStepUpChallengeRepository implements IAdminStepUpChallengeStore {
  private readonly _collection: Collection<StepUpDocument>;

  constructor(database: Db) {
    this._collection = database.collection<StepUpDocument>('admin_step_up_challenges');
  }

  public async create(stepUpId: string, adminId: string, expiresAt: Date): Promise<void> {
    const now = new Date();
    await this._collection.insertOne({
      stepUpId,
      adminId: new ObjectId(adminId),
      expiresAt,
      createdAt: now,
    });
  }

  public async get(stepUpId: string): Promise<{ adminId: string } | null> {
    const doc = await this._collection.findOne({
      stepUpId,
      expiresAt: { $gt: new Date() },
    });
    if (!doc) return null;
    return { adminId: doc.adminId.toString() };
  }

  public async delete(stepUpId: string): Promise<void> {
    await this._collection.deleteOne({ stepUpId });
  }
}
