import type { Collection, Db, ObjectId } from 'mongodb';

const COLLECTION = 'slc_run_skeletons';
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface IRunSkeletonRecord {
  readonly userId: ObjectId | string;
  readonly runId: string;
  readonly step: string;
  readonly sha256: string;
  readonly storageKey: string;
  readonly byteLength: number;
  readonly expiresAt: Date;
  readonly createdAt: Date;
}

export class RunSkeletonRepository {
  constructor(private readonly db: Db) {}

  private _collection(): Collection<IRunSkeletonRecord> {
    return this.db.collection<IRunSkeletonRecord>(COLLECTION);
  }

  async insert(
    record: Omit<IRunSkeletonRecord, 'createdAt' | 'expiresAt'>
  ): Promise<IRunSkeletonRecord> {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + RETENTION_MS);
    const doc: IRunSkeletonRecord = { ...record, createdAt, expiresAt };
    await this._collection().insertOne(doc);
    return doc;
  }

  async findByRunId(
    userId: ObjectId | string,
    runId: string
  ): Promise<readonly IRunSkeletonRecord[]> {
    return this._collection().find({ userId, runId }).sort({ createdAt: -1 }).toArray();
  }
}
