import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { CommunicationBatch, type ICommunicationBatchData } from '../../models/CommunicationBatch';

export interface ICommunicationBatchReader {
  findAll(limit?: number): Promise<readonly CommunicationBatch[]>;
  findById(id: string): Promise<CommunicationBatch | null>;
}

export interface ICommunicationBatchWriter {
  create(data: ICommunicationBatchData): Promise<CommunicationBatch>;
  update(id: string, updates: Partial<ICommunicationBatchData>): Promise<boolean>;
}

export class CommunicationBatchRepository
  implements ICommunicationBatchReader, ICommunicationBatchWriter
{
  private readonly _collection: Collection<ICommunicationBatchData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<ICommunicationBatchData & { _id?: ObjectId }>(
      'communication_batches'
    );
  }

  public async findAll(limit: number = 50): Promise<readonly CommunicationBatch[]> {
    const docs = await this._collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(Math.min(limit, 200))
      .toArray();
    return docs.map((d) => new CommunicationBatch(d, d._id));
  }

  public async findById(id: string): Promise<CommunicationBatch | null> {
    const doc = await this._collection.findOne({ _id: new ObjectId(id) });
    if (!doc || !doc._id) return null;
    return new CommunicationBatch(doc, doc._id);
  }

  public async create(data: ICommunicationBatchData): Promise<CommunicationBatch> {
    const now = new Date();
    const doc: ICommunicationBatchData = {
      ...data,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    const result = await this._collection.insertOne(doc);
    return new CommunicationBatch(doc, result.insertedId);
  }

  public async update(id: string, updates: Partial<ICommunicationBatchData>): Promise<boolean> {
    const objectId = new ObjectId(id);
    const setDoc: Record<string, unknown> = { ...updates, updatedAt: new Date() };
    delete setDoc['createdAt'];
    const result = await this._collection.updateOne({ _id: objectId }, { $set: setDoc });
    return result.modifiedCount > 0;
  }
}
