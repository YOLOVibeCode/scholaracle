import type { ObjectId } from 'mongodb';

export type IngestDeviceAuthStatus = 'pending' | 'approved' | 'expired';

export interface IIngestDeviceAuthData {
  readonly deviceCode: string;
  readonly userCode: string;
  readonly status?: IngestDeviceAuthStatus;
  readonly userId?: ObjectId | string;
  readonly connectorToken?: string;
  readonly tokenDeliveredAt?: Date;
  readonly expiresAt: Date;
  readonly createdAt?: Date;
  readonly approvedAt?: Date;
}

export class IngestDeviceAuth {
  public readonly _id?: ObjectId;
  public readonly deviceCode: string;
  public readonly userCode: string;
  public readonly status: IngestDeviceAuthStatus;
  public readonly userId?: ObjectId | string;
  public readonly connectorToken?: string;
  public readonly tokenDeliveredAt?: Date;
  public readonly expiresAt: Date;
  public readonly createdAt: Date;
  public readonly approvedAt?: Date;

  constructor(data: IIngestDeviceAuthData, id?: ObjectId) {
    this._id = id;
    this.deviceCode = data.deviceCode;
    this.userCode = data.userCode;
    this.status = data.status ?? 'pending';
    this.userId = data.userId;
    this.connectorToken = data.connectorToken;
    this.tokenDeliveredAt = data.tokenDeliveredAt;
    this.expiresAt = data.expiresAt;
    this.createdAt = data.createdAt ?? new Date();
    this.approvedAt = data.approvedAt;
  }
}
