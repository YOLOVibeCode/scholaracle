import type { Collection, Db, ObjectId } from 'mongodb';
import { IngestDeviceAuth, type IngestDeviceAuthStatus, type IIngestDeviceAuthData } from '../../models/IngestDeviceAuth';

export class IngestDeviceAuthRepository {
  private readonly _collection: Collection<IIngestDeviceAuthData>;

  constructor(database: Db) {
    this._collection = database.collection<IIngestDeviceAuthData>('slc_device_auth');
  }

  async createPending(params: {
    readonly deviceCode: string;
    readonly userCode: string;
    readonly expiresAt: Date;
  }): Promise<IngestDeviceAuth> {
    const doc: IIngestDeviceAuthData = {
      deviceCode: params.deviceCode,
      userCode: params.userCode,
      status: 'pending',
      expiresAt: params.expiresAt,
      createdAt: new Date(),
    };

    const result = await this._collection.insertOne(doc);
    return new IngestDeviceAuth(doc, result.insertedId);
  }

  async findByDeviceCode(deviceCode: string): Promise<IngestDeviceAuth | null> {
    const doc = await this._collection.findOne({ deviceCode });
    if (!doc) return null;
    return new IngestDeviceAuth(doc, doc._id as unknown as ObjectId);
  }

  async markExpired(deviceCode: string): Promise<void> {
    await this._collection.updateOne({ deviceCode }, { $set: { status: 'expired' satisfies IngestDeviceAuthStatus } });
  }

  async approveByUserCode(userCode: string, userId: ObjectId | string, connectorToken: string): Promise<boolean> {
    const now = new Date();
    const result = await this._collection.updateOne(
      { userCode, status: 'pending', expiresAt: { $gt: now } },
      {
        $set: {
          status: 'approved' satisfies IngestDeviceAuthStatus,
          userId,
          connectorToken,
          approvedAt: now,
        },
      }
    );

    return result.modifiedCount === 1;
  }

  async deliverTokenOnce(deviceCode: string): Promise<{ readonly status: IngestDeviceAuthStatus; readonly token?: string }> {
    const doc = await this._collection.findOne({ deviceCode });
    if (!doc) return { status: 'expired' };

    const now = new Date();
    if (doc.expiresAt <= now && doc.status === 'pending') {
      await this.markExpired(deviceCode);
      return { status: 'expired' };
    }

    if (doc.status !== 'approved') {
      return { status: doc.status ?? 'pending' };
    }

    // If already delivered, return approved without token
    if (doc.tokenDeliveredAt) {
      return { status: 'approved' };
    }

    if (!doc.connectorToken) {
      return { status: 'approved' };
    }

    await this._collection.updateOne({ deviceCode }, { $set: { tokenDeliveredAt: new Date() } });
    return { status: 'approved', token: doc.connectorToken };
  }
}


