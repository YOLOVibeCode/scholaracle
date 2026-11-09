import type { ObjectId } from 'mongodb';

export interface IConnectorDeviceData {
  readonly userId: string;
  readonly deviceId: string;
  readonly activeJti: string;
  readonly platform?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly revokedAt?: Date | null;
}

export class ConnectorDevice {
  public readonly userId: string;
  public readonly deviceId: string;
  public readonly activeJti: string;
  public readonly platform?: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly revokedAt?: Date | null;

  constructor(
    data: IConnectorDeviceData,
    readonly id?: ObjectId
  ) {
    this.userId = data.userId;
    this.deviceId = data.deviceId;
    this.activeJti = data.activeJti;
    this.platform = data.platform;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.revokedAt = data.revokedAt;
  }

  get isRevoked(): boolean {
    return this.revokedAt != null;
  }

  hasActiveJti(jti: string): boolean {
    return !this.isRevoked && this.activeJti === jti;
  }
}
