import type { Collection, Db, ObjectId } from 'mongodb';
import { IngestSource, type IIngestSourceData } from '../../models/IngestSource';

export interface IIngestSourceReader {
  listByUserId(userId: ObjectId | string): Promise<readonly IngestSource[]>;
  findByUserIdAndSourceId(
    userId: ObjectId | string,
    sourceId: string
  ): Promise<IngestSource | null>;
}

export interface IIngestSourceWriter {
  upsert(source: IIngestSourceData): Promise<IngestSource>;
}

export class IngestSourceRepository implements IIngestSourceReader, IIngestSourceWriter {
  private readonly _collection: Collection<IIngestSourceData>;

  constructor(database: Db) {
    this._collection = database.collection<IIngestSourceData>('slc_sources');
  }

  async upsert(source: IIngestSourceData): Promise<IngestSource> {
    const now = new Date();
    const doc: IIngestSourceData = {
      ...source,
      updatedAt: now,
      createdAt: source.createdAt ?? now,
    };

    await this._collection.updateOne(
      { userId: source.userId, sourceId: source.sourceId },
      { $set: doc },
      { upsert: true }
    );

    const stored = await this._collection.findOne({
      userId: source.userId,
      sourceId: source.sourceId,
    });
    if (!stored) return new IngestSource(doc);
    return new IngestSource(stored, stored._id as unknown as ObjectId);
  }

  async listByUserId(userId: ObjectId | string): Promise<readonly IngestSource[]> {
    const docs = await this._collection.find({ userId }).sort({ updatedAt: -1 }).toArray();
    return docs.map((d) => new IngestSource(d, d._id as unknown as ObjectId));
  }

  async findByUserIdAndSourceId(
    userId: ObjectId | string,
    sourceId: string
  ): Promise<IngestSource | null> {
    const doc = await this._collection.findOne({ userId, sourceId });
    if (!doc) return null;
    return new IngestSource(doc, doc._id as unknown as ObjectId);
  }
}
