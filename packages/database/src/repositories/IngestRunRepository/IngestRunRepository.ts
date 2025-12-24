import type { Collection, Db, ObjectId } from 'mongodb';
import { IngestRun, type IIngestRunData, type IngestRunStatus } from '../../models/IngestRun';

export class IngestRunRepository {
  private readonly _collection: Collection<IIngestRunData>;

  constructor(database: Db) {
    this._collection = database.collection<IIngestRunData>('slc_runs');
  }

  async startRun(params: {
    readonly userId: ObjectId | string;
    readonly sourceId: string;
    readonly runId: string;
    readonly lastCursor?: { readonly type: 'opaque'; readonly value: string } | null;
  }): Promise<IngestRun> {
    const doc: IIngestRunData = {
      userId: params.userId,
      sourceId: params.sourceId,
      runId: params.runId,
      mode: 'delta',
      status: 'started',
      lastCursor: params.lastCursor ?? null,
      startedAt: new Date(),
      error: null,
    };

    await this._collection.insertOne(doc);
    const stored = await this._collection.findOne({ userId: params.userId, runId: params.runId });
    return new IngestRun((stored ?? doc) as IIngestRunData);
  }

  async markUploaded(userId: ObjectId | string, runId: string): Promise<void> {
    await this._collection.updateOne(
      { userId, runId },
      { $set: { status: 'uploaded' satisfies IngestRunStatus, uploadedAt: new Date() } }
    );
  }

  async commitRun(params: {
    readonly userId: ObjectId | string;
    readonly runId: string;
    readonly newCursor?: { readonly type: 'opaque'; readonly value: string } | null;
  }): Promise<void> {
    await this._collection.updateOne(
      { userId: params.userId, runId: params.runId },
      {
        $set: {
          status: 'committed' satisfies IngestRunStatus,
          committedAt: new Date(),
          newCursor: params.newCursor ?? null,
        },
      }
    );
  }

  async findByUserIdAndRunId(userId: ObjectId | string, runId: string): Promise<IngestRun | null> {
    const doc = await this._collection.findOne({ userId, runId });
    if (!doc) return null;
    return new IngestRun(doc, doc._id as unknown as ObjectId);
  }

  async findLastCommittedCursor(userId: ObjectId | string, sourceId: string): Promise<{ type: 'opaque'; value: string } | null> {
    const last = await this._collection
      .find({ userId, sourceId, status: 'committed', newCursor: { $ne: null } })
      .sort({ committedAt: -1 })
      .limit(1)
      .toArray();

    const doc = last[0];
    if (!doc?.newCursor) return null;
    return doc.newCursor;
  }
}


