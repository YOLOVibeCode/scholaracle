import type { ObjectId } from 'mongodb';
import type { ISlcRunCoverage } from '@scholaracle/contracts';

export type IngestRunStatus = 'started' | 'uploaded' | 'committed' | 'failed' | 'abandoned';

export interface IIngestRunData {
  /** Owner userId — the slc_* tenant partition for this run's data. */
  readonly userId: ObjectId | string;
  /**
   * The userId of the account that initiated this run (may differ from userId when
   * a co-parent triggers a sync: actorUserId = co-parent, userId = student owner).
   */
  readonly actorUserId?: ObjectId | string;
  readonly sourceId: string;
  readonly runId: string;
  readonly mode: 'delta';
  readonly status?: IngestRunStatus;
  readonly lastCursor?: { readonly type: 'opaque'; readonly value: string } | null;
  readonly newCursor?: { readonly type: 'opaque'; readonly value: string } | null;
  readonly startedAt: Date;
  readonly uploadedAt?: Date;
  readonly committedAt?: Date;
  readonly failedAt?: Date;
  readonly abandonedAt?: Date;
  readonly error?: string | null;
  /** Client identity stamp (app/extension/CLI + versions). */
  readonly clientMeta?: Readonly<Record<string, string>> | null;
  readonly coverage?: ISlcRunCoverage | null;
  readonly warnings?: readonly string[] | null;
}

export class IngestRun {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
  public readonly actorUserId?: ObjectId | string;
  public readonly sourceId: string;
  public readonly runId: string;
  public readonly mode: 'delta';
  public readonly status: IngestRunStatus;
  public readonly lastCursor?: { readonly type: 'opaque'; readonly value: string } | null;
  public readonly newCursor?: { readonly type: 'opaque'; readonly value: string } | null;
  public readonly startedAt: Date;
  public readonly uploadedAt?: Date;
  public readonly committedAt?: Date;
  public readonly failedAt?: Date;
  public readonly abandonedAt?: Date;
  public readonly error?: string | null;
  public readonly clientMeta?: Readonly<Record<string, string>> | null;
  public readonly coverage?: ISlcRunCoverage | null;
  public readonly warnings?: readonly string[] | null;

  constructor(data: IIngestRunData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.actorUserId = data.actorUserId;
    this.sourceId = data.sourceId;
    this.runId = data.runId;
    this.mode = data.mode;
    this.status = data.status ?? 'started';
    this.lastCursor = data.lastCursor;
    this.newCursor = data.newCursor;
    this.startedAt = data.startedAt;
    this.uploadedAt = data.uploadedAt;
    this.committedAt = data.committedAt;
    this.failedAt = data.failedAt;
    this.abandonedAt = data.abandonedAt;
    this.error = data.error ?? null;
    this.clientMeta = data.clientMeta ?? null;
    this.coverage = data.coverage ?? null;
    this.warnings = data.warnings ?? null;
  }
}
