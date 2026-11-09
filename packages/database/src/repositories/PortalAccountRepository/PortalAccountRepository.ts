import type { Collection, Db, ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { PortalAccount, type IPortalAccountData } from '../../models/PortalAccount';

export interface IPortalAccountUpsertInput {
  readonly userId: ObjectId | string;
  readonly provider: string;
  readonly adapterId: string;
  readonly portalBaseUrl: string;
  readonly institutionExternalId: string;
  readonly displayName: string;
}

export class PortalAccountRepository {
  private readonly _collection: Collection<IPortalAccountData>;

  constructor(database: Db) {
    this._collection = database.collection<IPortalAccountData>('slc_portal_accounts');
  }

  async upsertByHost(input: IPortalAccountUpsertInput): Promise<PortalAccount> {
    const now = new Date();
    const existing = await this._collection.findOne({
      userId: input.userId,
      provider: input.provider,
      institutionExternalId: input.institutionExternalId,
    });

    const portalAccountId = existing?.portalAccountId ?? randomUUID();
    const doc: IPortalAccountData = {
      userId: input.userId,
      portalAccountId,
      provider: input.provider,
      adapterId: input.adapterId,
      portalBaseUrl: input.portalBaseUrl,
      institutionExternalId: input.institutionExternalId,
      displayName: input.displayName,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await this._collection.updateOne(
      { userId: input.userId, portalAccountId },
      { $set: doc },
      { upsert: true }
    );

    const stored = await this._collection.findOne({ userId: input.userId, portalAccountId });
    if (!stored) return new PortalAccount(doc);
    return new PortalAccount(stored, stored._id as unknown as ObjectId);
  }

  async findByPortalAccountId(
    userId: ObjectId | string,
    portalAccountId: string
  ): Promise<PortalAccount | null> {
    const doc = await this._collection.findOne({ userId, portalAccountId });
    if (!doc) return null;
    return new PortalAccount(doc, doc._id as unknown as ObjectId);
  }
}
