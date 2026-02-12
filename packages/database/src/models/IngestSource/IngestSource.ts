import type { ObjectId } from 'mongodb';

export interface IIngestSourceData {
  readonly userId: ObjectId | string;
  readonly sourceId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
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
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
