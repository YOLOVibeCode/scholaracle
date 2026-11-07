import type { Collection, Db, ObjectId } from 'mongodb';
import type {
  ISlcIngestRunStats,
  ISlcIngestRunStep,
  ISlcRunCoverage,
} from '@scholaracle/contracts';
import { IngestRun, type IIngestRunData, type IngestRunStatus } from '../../models/IngestRun';

export interface IIngestRunReader {
  findByUserIdAndRunId(userId: ObjectId | string, runId: string): Promise<IngestRun | null>;
  findByUserIdSourceIdAndRunId(
    userId: ObjectId | string,
    sourceId: string,
    runId: string
  ): Promise<IngestRun | null>;
  findByRunId(runId: string): Promise<IngestRun | null>;
  findLastCommittedCursor(
    userId: ObjectId | string,
    sourceId: string
  ): Promise<{ type: 'opaque'; value: string } | null>;
  listByUserIdAndSourceId(
    userId: ObjectId | string,
    sourceId: string,
    limit?: number
  ): Promise<readonly IngestRun[]>;
}

export interface IIngestRunWriter {
  startRun(params: {
    readonly userId: ObjectId | string;
    readonly actorUserId?: ObjectId | string;
    readonly sourceId: string;
    readonly runId: string;
    readonly lastCursor?: { readonly type: 'opaque'; readonly value: string } | null;
    readonly clientMeta?: Readonly<Record<string, string>> | null;
    readonly initialStep?: ISlcIngestRunStep;
  }): Promise<IngestRun>;
  appendTraceStep(
    userId: ObjectId | string,
    runId: string,
    patch: {
      readonly step: ISlcIngestRunStep;
      readonly stats?: ISlcIngestRunStats;
      readonly warnings?: readonly string[];
    }
  ): Promise<void>;
  markUploaded(
    userId: ObjectId | string,
    runId: string,
    extras?: {
      readonly coverage?: ISlcRunCoverage | null;
      readonly warnings?: readonly string[] | null;
      readonly stats?: ISlcIngestRunStats | null;
      readonly opCount?: number;
    }
  ): Promise<void>;
  commitRun(params: {
    readonly userId: ObjectId | string;
    readonly runId: string;
    readonly newCursor?: { readonly type: 'opaque'; readonly value: string } | null;
    readonly coverage?: ISlcRunCoverage | null;
    readonly warnings?: readonly string[] | null;
  }): Promise<void>;
  failRun(params: {
    readonly userId: ObjectId | string;
    readonly runId: string;
    readonly error: string;
  }): Promise<void>;
}

export class IngestRunRepository implements IIngestRunReader, IIngestRunWriter {
  private readonly _collection: Collection<IIngestRunData>;

  constructor(database: Db) {
    this._collection = database.collection<IIngestRunData>('slc_runs');
  }

  async startRun(params: {
    readonly userId: ObjectId | string;
    readonly actorUserId?: ObjectId | string;
    readonly sourceId: string;
    readonly runId: string;
    readonly lastCursor?: { readonly type: 'opaque'; readonly value: string } | null;
    readonly clientMeta?: Readonly<Record<string, string>> | null;
    readonly initialStep?: ISlcIngestRunStep;
  }): Promise<IngestRun> {
    const doc: IIngestRunData = {
      userId: params.userId,
      actorUserId: params.actorUserId ?? params.userId,
      sourceId: params.sourceId,
      runId: params.runId,
      mode: 'delta',
      status: 'started',
      lastCursor: params.lastCursor ?? null,
      startedAt: new Date(),
      error: null,
      clientMeta: params.clientMeta ?? null,
      ...(params.initialStep !== undefined ? { steps: [params.initialStep] } : {}),
    };

    await this._collection.insertOne(doc);
    const stored = await this._collection.findOne({ userId: params.userId, runId: params.runId });
    return new IngestRun(stored ?? doc);
  }

  async markUploaded(
    userId: ObjectId | string,
    runId: string,
    extras?: {
      readonly coverage?: ISlcRunCoverage | null;
      readonly warnings?: readonly string[] | null;
      readonly stats?: ISlcIngestRunStats | null;
      readonly opCount?: number;
    }
  ): Promise<void> {
    const existing = await this._collection.findOne({ userId, runId });
    const setDoc: Record<string, unknown> = {
      status: 'uploaded' satisfies IngestRunStatus,
      uploadedAt: new Date(),
    };
    if (extras?.coverage !== undefined) {
      setDoc['coverage'] = extras.coverage;
    }
    if (extras?.warnings !== undefined) {
      const prior = existing?.warnings ? [...existing.warnings] : [];
      const incoming = extras.warnings ? [...extras.warnings] : [];
      setDoc['warnings'] = [...prior, ...incoming];
    }
    if (extras?.stats !== undefined) {
      setDoc['stats'] = { ...(existing?.stats ?? {}), ...extras.stats };
    }
    if (extras?.opCount !== undefined) {
      setDoc['opCount'] = extras.opCount;
    }
    await this._collection.updateOne({ userId, runId }, { $set: setDoc });
  }

  async appendTraceStep(
    userId: ObjectId | string,
    runId: string,
    patch: {
      readonly step: ISlcIngestRunStep;
      readonly stats?: ISlcIngestRunStats;
      readonly warnings?: readonly string[];
    }
  ): Promise<void> {
    const existing = await this._collection.findOne({ userId, runId });
    const setDoc: Record<string, unknown> = {};
    if (patch.stats !== undefined) {
      setDoc['stats'] = { ...(existing?.stats ?? {}), ...patch.stats };
    }
    if (patch.warnings !== undefined) {
      const prior = existing?.warnings ? [...existing.warnings] : [];
      setDoc['warnings'] = [...prior, ...patch.warnings];
    }
    const update: { $push: { steps: ISlcIngestRunStep }; $set?: Record<string, unknown> } = {
      $push: { steps: patch.step },
    };
    if (Object.keys(setDoc).length > 0) {
      update.$set = setDoc;
    }
    await this._collection.updateOne({ userId, runId }, update);
  }

  async commitRun(params: {
    readonly userId: ObjectId | string;
    readonly runId: string;
    readonly newCursor?: { readonly type: 'opaque'; readonly value: string } | null;
    readonly coverage?: ISlcRunCoverage | null;
    readonly warnings?: readonly string[] | null;
  }): Promise<void> {
    const existing = await this._collection.findOne({
      userId: params.userId,
      runId: params.runId,
    });
    const coverageToSet =
      params.coverage !== undefined ? params.coverage : (existing?.coverage ?? null);
    const warningsToSet =
      params.warnings !== undefined ? params.warnings : (existing?.warnings ?? null);
    const opCountToSet = existing?.opCount;

    await this._collection.updateOne(
      { userId: params.userId, runId: params.runId },
      {
        $set: {
          status: 'committed' satisfies IngestRunStatus,
          committedAt: new Date(),
          newCursor: params.newCursor ?? null,
          coverage: coverageToSet,
          warnings: warningsToSet,
          ...(opCountToSet !== undefined ? { opCount: opCountToSet } : {}),
        },
      }
    );
  }

  async failRun(params: {
    readonly userId: ObjectId | string;
    readonly runId: string;
    readonly error: string;
  }): Promise<void> {
    await this._collection.updateOne(
      { userId: params.userId, runId: params.runId },
      {
        $set: {
          status: 'failed' satisfies IngestRunStatus,
          failedAt: new Date(),
          error: params.error,
        },
      }
    );
  }

  async findByUserIdAndRunId(userId: ObjectId | string, runId: string): Promise<IngestRun | null> {
    const doc = await this._collection.findOne({ userId, runId });
    if (!doc) return null;
    return new IngestRun(doc, doc._id as unknown as ObjectId);
  }

  async findByUserIdSourceIdAndRunId(
    userId: ObjectId | string,
    sourceId: string,
    runId: string
  ): Promise<IngestRun | null> {
    const doc = await this._collection.findOne({ userId, sourceId, runId });
    if (!doc) return null;
    return new IngestRun(doc, doc._id as unknown as ObjectId);
  }

  /** Find a run by runId only (no userId filter). Used when dataUserId is not yet known. */
  async findByRunId(runId: string): Promise<IngestRun | null> {
    const doc = await this._collection.findOne({ runId });
    if (!doc) return null;
    return new IngestRun(doc, doc._id as unknown as ObjectId);
  }

  async findLastCommittedCursor(
    userId: ObjectId | string,
    sourceId: string
  ): Promise<{ type: 'opaque'; value: string } | null> {
    const last = await this._collection
      .find({ userId, sourceId, status: 'committed', newCursor: { $ne: null } })
      .sort({ committedAt: -1 })
      .limit(1)
      .toArray();

    const doc = last[0];
    if (!doc?.newCursor) return null;
    return doc.newCursor;
  }

  async listByUserIdAndSourceId(
    userId: ObjectId | string,
    sourceId: string,
    limit = 50
  ): Promise<readonly IngestRun[]> {
    const docs = await this._collection
      .find({ userId, sourceId })
      .sort({ startedAt: -1 })
      .limit(limit)
      .toArray();
    return docs.map((d) => new IngestRun(d, d._id as unknown as ObjectId));
  }
}
