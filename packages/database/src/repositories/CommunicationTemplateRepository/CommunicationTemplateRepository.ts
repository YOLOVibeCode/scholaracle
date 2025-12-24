import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { CommunicationTemplate, type ICommunicationTemplateData } from '../../models/CommunicationTemplate';

export interface ICommunicationTemplateReader {
  findAll(): Promise<readonly CommunicationTemplate[]>;
  findById(id: string): Promise<CommunicationTemplate | null>;
}

export interface ICommunicationTemplateWriter {
  create(data: ICommunicationTemplateData): Promise<CommunicationTemplate>;
  update(id: string, updates: Partial<ICommunicationTemplateData>): Promise<boolean>;
}

/**
 * Repository for CommunicationTemplate operations (ISP: reader/writer).
 */
export class CommunicationTemplateRepository implements ICommunicationTemplateReader, ICommunicationTemplateWriter {
  private readonly _collection: Collection<ICommunicationTemplateData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<ICommunicationTemplateData & { _id?: ObjectId }>('communication_templates');
  }

  public async findAll(): Promise<readonly CommunicationTemplate[]> {
    const docs = await this._collection.find({}).sort({ updatedAt: -1 }).toArray();
    return docs.map((d) => new CommunicationTemplate(d, d._id));
  }

  public async findById(id: string): Promise<CommunicationTemplate | null> {
    const doc = await this._collection.findOne({ _id: new ObjectId(id) });
    if (!doc || !doc._id) return null;
    return new CommunicationTemplate(doc, doc._id);
  }

  public async create(data: ICommunicationTemplateData): Promise<CommunicationTemplate> {
    const now = new Date();
    const document: ICommunicationTemplateData = {
      ...data,
      isActive: data.isActive ?? true,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    const result = await this._collection.insertOne(document);
    return new CommunicationTemplate(document, result.insertedId);
  }

  public async update(id: string, updates: Partial<ICommunicationTemplateData>): Promise<boolean> {
    const objectId = new ObjectId(id);
    const setDoc: Record<string, unknown> = { ...updates, updatedAt: new Date() };
    delete setDoc['createdAt'];
    const result = await this._collection.updateOne({ _id: objectId }, { $set: setDoc });
    return result.modifiedCount > 0;
  }
}


