import type { ObjectId } from 'mongodb';

export interface IIngestSourceData {
  readonly userId: ObjectId | string;
  readonly sourceId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
  readonly schedule?: string;
  readonly dataTypes?: readonly string[];
  readonly enabled?: boolean;
  readonly lastSyncedAt?: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class IngestSource {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
  public readonly sourceId: string;
  public readonly provider: string;
  public readonly adapterId: string;
  public readonly displayName: string;
  public readonly portalBaseUrl?: string;
  public readonly schedule: string;
  public readonly dataTypes: readonly string[];
  public readonly enabled: boolean;
  public readonly lastSyncedAt?: Date;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IIngestSourceData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.sourceId = data.sourceId;
    this.provider = data.provider;
    this.adapterId = data.adapterId;
    this.displayName = data.displayName;
    this.portalBaseUrl = data.portalBaseUrl;
    this.schedule = data.schedule ?? 'every_6h';
    this.dataTypes = data.dataTypes ?? [];
    this.enabled = data.enabled ?? true;
    this.lastSyncedAt = data.lastSyncedAt;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
