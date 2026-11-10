import type { Collection, Db, ObjectId } from 'mongodb';
import { ConnectorDevice, type IConnectorDeviceData } from '../../models/ConnectorDevice';

export interface IConnectorDeviceReader {
  findByUserAndDevice(userId: ObjectId | string, deviceId: string): Promise<ConnectorDevice | null>;
}

export interface IConnectorDeviceWriter {
  upsertActiveToken(params: {
    readonly userId: string;
    readonly deviceId: string;
    readonly activeJti: string;
    readonly platform?: string;
  }): Promise<ConnectorDevice>;
  revokeDevice(userId: ObjectId | string, deviceId: string): Promise<string | null>;
}

function userIdFilter(userId: ObjectId | string): string {
  return typeof userId === 'string' ? userId : userId.toString();
}

export class ConnectorDeviceRepository implements IConnectorDeviceReader, IConnectorDeviceWriter {
  private readonly _collection: Collection<IConnectorDeviceData>;

  constructor(database: Db) {
    this._collection = database.collection<IConnectorDeviceData>('slc_devices');
  }

  async findByUserAndDevice(
    userId: ObjectId | string,
    deviceId: string
  ): Promise<ConnectorDevice | null> {
    const doc = await this._collection.findOne({ userId: userIdFilter(userId), deviceId });
    if (!doc) return null;
    return new ConnectorDevice(doc, doc._id as unknown as ObjectId);
  }

  async upsertActiveToken(params: {
    readonly userId: string;
    readonly deviceId: string;
    readonly activeJti: string;
    readonly platform?: string;
  }): Promise<ConnectorDevice> {
    const now = new Date();
    const setOnInsert: Partial<IConnectorDeviceData> = {
      userId: params.userId,
      deviceId: params.deviceId,
      createdAt: now,
    };
    const update: Partial<IConnectorDeviceData> = {
      activeJti: params.activeJti,
      updatedAt: now,
      revokedAt: null,
      ...(params.platform ? { platform: params.platform } : {}),
    };

    const uid = userIdFilter(params.userId);
    await this._collection.updateOne(
      { userId: uid, deviceId: params.deviceId },
      { $set: update, $setOnInsert: setOnInsert },
      { upsert: true }
    );

    const doc = await this._collection.findOne({ userId: uid, deviceId: params.deviceId });
    if (!doc) {
      return new ConnectorDevice({
        userId: params.userId,
        deviceId: params.deviceId,
        activeJti: params.activeJti,
        platform: params.platform,
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
      });
    }
    return new ConnectorDevice(doc, doc._id as unknown as ObjectId);
  }

  async revokeDevice(userId: ObjectId | string, deviceId: string): Promise<string | null> {
    const existing = await this.findByUserAndDevice(userId, deviceId);
    if (!existing || existing.isRevoked) return null;

    const now = new Date();
    await this._collection.updateOne(
      { userId: userIdFilter(userId), deviceId },
      { $set: { revokedAt: now, updatedAt: now } }
    );
    return existing.activeJti;
  }
}
