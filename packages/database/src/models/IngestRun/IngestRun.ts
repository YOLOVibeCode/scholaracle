import type { ObjectId } from 'mongodb';

export type IngestRunStatus = 'started' | 'uploaded' | 'committed' | 'failed';

export interface IIngestRunData {
  readonly userId: ObjectId | string;
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
  readonly error?: string | null;
  /** Client identity stamp (app/extension/CLI + versions). */
  readonly clientMeta?: Readonly<Record<string, string>> | null;
}

export class IngestRun {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
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
  public readonly error?: string | null;
  public readonly clientMeta?: Readonly<Record<string, string>> | null;

  constructor(data: IIngestRunData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
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
    this.error = data.error ?? null;
    this.clientMeta = data.clientMeta ?? null;
  }
}
