import type { Collection, Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { ISourceInvitePayload, SourceInviteProvider } from '@scholaracle/contracts';
import type { ISourceInviteRecord, ISourceInviteStore } from './ISourceInviteStore';

interface ISourceInviteDocument {
  readonly _id?: ObjectId;
  readonly userId: ObjectId;
  readonly tokenHash: string;
  readonly payload: ISourceInvitePayload;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly consumedAt: Date | null;
}

function toRecord(doc: ISourceInviteDocument & { _id: ObjectId }): ISourceInviteRecord {
  return {
    id: doc._id.toString(),
    userId: doc.userId.toString(),
    tokenHash: doc.tokenHash,
    payload: doc.payload,
    expiresAt: doc.expiresAt,
    createdAt: doc.createdAt,
    consumedAt: doc.consumedAt,
  };
}

/**
 * Hashed source-invite tokens. Never stores the raw token (SOURCE_INVITE.md §4.2).
 */
export class SourceInviteRepository implements ISourceInviteStore {
  private readonly _collection: Collection<ISourceInviteDocument>;

  constructor(database: Db) {
    this._collection = database.collection<ISourceInviteDocument>('source_invites');
  }

  public async insert(record: Omit<ISourceInviteRecord, 'id'>): Promise<ISourceInviteRecord> {
    const document: ISourceInviteDocument = {
      userId: new ObjectId(record.userId),
      tokenHash: record.tokenHash,
      payload: record.payload,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      consumedAt: record.consumedAt,
    };
    const result = await this._collection.insertOne(document);
    return toRecord({ ...document, _id: result.insertedId });
  }

  public async findByHash(tokenHash: string): Promise<ISourceInviteRecord | null> {
    const doc = await this._collection.findOne({ tokenHash });
    if (!doc?._id) return null;
    return toRecord({ ...doc, _id: doc._id });
  }

  public async consumeIfOpen(id: string, now: Date): Promise<boolean> {
    const result = await this._collection.updateOne(
      {
        _id: new ObjectId(id),
        consumedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { consumedAt: now } }
    );
    return result.modifiedCount === 1;
  }

  public async invalidateOpen(params: {
    readonly userId: string;
    readonly studentId: string;
    readonly provider: SourceInviteProvider;
    readonly institutionExternalId: string;
    readonly now: Date;
  }): Promise<number> {
    const result = await this._collection.updateMany(
      {
        userId: new ObjectId(params.userId),
        'payload.studentId': params.studentId,
        'payload.provider': params.provider,
        'payload.institutionExternalId': params.institutionExternalId,
        consumedAt: null,
      },
      { $set: { consumedAt: params.now } }
    );
    return result.modifiedCount;
  }
}
