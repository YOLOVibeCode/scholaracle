import type { ObjectId } from 'mongodb';

export interface IPortalAccountData {
  readonly userId: ObjectId | string;
  readonly portalAccountId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly portalBaseUrl: string;
  readonly institutionExternalId: string;
  readonly displayName: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class PortalAccount {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
  public readonly portalAccountId: string;
  public readonly provider: string;
  public readonly adapterId: string;
  public readonly portalBaseUrl: string;
  public readonly institutionExternalId: string;
  public readonly displayName: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IPortalAccountData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.portalAccountId = data.portalAccountId;
    this.provider = data.provider;
    this.adapterId = data.adapterId;
    this.portalBaseUrl = data.portalBaseUrl;
    this.institutionExternalId = data.institutionExternalId;
    this.displayName = data.displayName;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
