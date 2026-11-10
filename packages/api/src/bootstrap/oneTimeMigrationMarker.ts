import type { AnyBulkWriteOperation, Collection, Db, Document } from 'mongodb';

/** Marker rows live here; one `_id` per one-time migration. */
export const MARKER_COLLECTION = 'one_time_migrations';

export interface IOneTimeMigrationMarker {
  readonly _id: string;
  readonly startedAt: Date;
  readonly appliedAt?: Date;
  readonly stats?: unknown;
}

export interface ILog {
  info(obj: object, msg: string): void;
}

export type OneTimeMigrationResult = 'disabled' | 'already-applied' | 'dry-run' | 'applied';

/**
 * Claim a migration marker atomically. With several API replicas booting at once only the
 * replica whose upsert inserted the row (`upsertedCount === 1`) proceeds; the others see
 * `false` and skip, instead of racing to a duplicate-key error after the work is done.
 */
export async function claimMarker(db: Db, markerId: string): Promise<boolean> {
  const markers = db.collection<IOneTimeMigrationMarker>(MARKER_COLLECTION);
  const result = await markers.updateOne(
    { _id: markerId },
    { $setOnInsert: { _id: markerId, startedAt: new Date() } },
    { upsert: true }
  );
  return result.upsertedCount === 1;
}

/** Record the outcome on the claimed marker. */
export async function completeMarker(db: Db, markerId: string, stats: unknown): Promise<void> {
  await db
    .collection<IOneTimeMigrationMarker>(MARKER_COLLECTION)
    .updateOne({ _id: markerId }, { $set: { appliedAt: new Date(), stats } });
}

/** Default number of writes per `bulkWrite` round trip. */
export const BULK_BATCH_SIZE = 500;

/** Collects update operations and flushes them in batches; a no-op when not applying. */
export class BulkUpdater<TSchema extends Document> {
  private readonly _ops: AnyBulkWriteOperation<TSchema>[] = [];
  public batches = 0;

  constructor(
    private readonly _collection: Collection<TSchema>,
    private readonly _apply: boolean,
    private readonly _batchSize: number = BULK_BATCH_SIZE
  ) {}

  public async add(op: AnyBulkWriteOperation<TSchema>): Promise<void> {
    if (!this._apply) return;
    this._ops.push(op);
    if (this._ops.length >= this._batchSize) await this.flush();
  }

  public async flush(): Promise<void> {
    if (this._ops.length === 0) return;
    const ops = this._ops.splice(0, this._ops.length);
    await this._collection.bulkWrite(ops, { ordered: false });
    this.batches += 1;
  }
}

/**
 * Shared driver for env-gated one-time migrations: `<ENV>=dry-run` runs `work(false)` and logs
 * the plan; `<ENV>=apply` claims the marker, runs `work(true)` and records the stats, so a
 * later boot (or a sibling replica) never repeats it. Anything else is a no-op.
 */
export async function runOneTimeMigration<TStats>(params: {
  readonly db: Db;
  readonly log: ILog;
  readonly envVar: string;
  readonly markerId: string;
  readonly work: (apply: boolean) => Promise<TStats>;
}): Promise<OneTimeMigrationResult> {
  const { db, log, envVar, markerId, work } = params;
  const mode = process.env[envVar];
  if (mode !== 'dry-run' && mode !== 'apply') return 'disabled';

  const apply = mode === 'apply';
  if (apply && !(await claimMarker(db, markerId))) {
    log.info({ migration: markerId }, 'one-time migration already applied; skipping');
    return 'already-applied';
  }

  const stats = await work(apply);
  log.info({ migration: markerId, mode, stats }, 'one-time migration result');

  if (apply) {
    await completeMarker(db, markerId, stats);
    return 'applied';
  }
  return 'dry-run';
}
