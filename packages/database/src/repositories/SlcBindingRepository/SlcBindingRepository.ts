import type { Collection, Db, ObjectId } from 'mongodb';
import { ObjectId as MongoObjectId } from 'mongodb';
import { SlcBinding, type ISlcBindingData } from '../../models/SlcBinding';

export interface ISlcBindingUpsertInput {
  readonly userId: ObjectId | string;
  readonly portalAccountId: string;
  readonly studentId: ObjectId | string;
  readonly sourceId: string;
  readonly studentExternalId: string;
}

export class SlcBindingRepository {
  private readonly _collection: Collection<ISlcBindingData>;

  constructor(database: Db) {
    this._collection = database.collection<ISlcBindingData>('slc_bindings');
  }

  async upsert(input: ISlcBindingUpsertInput): Promise<SlcBinding> {
    const now = new Date();
    const studentId =
      typeof input.studentId === 'string'
        ? MongoObjectId.isValid(input.studentId)
          ? new MongoObjectId(input.studentId)
          : input.studentId
        : input.studentId;

    const existing = await this._collection.findOne({
      userId: input.userId,
      sourceId: input.sourceId,
    });
    const createdAt = existing?.createdAt ?? now;
    const doc: ISlcBindingData = {
      userId: input.userId,
      portalAccountId: input.portalAccountId,
      studentId,
      sourceId: input.sourceId,
      studentExternalId: input.studentExternalId,
      createdAt,
      updatedAt: now,
    };

    await this._collection.updateOne(
      { userId: input.userId, sourceId: input.sourceId },
      { $set: doc },
      { upsert: true }
    );

    const stored = await this._collection.findOne({
      userId: input.userId,
      sourceId: input.sourceId,
    });
    if (!stored) return new SlcBinding(doc);
    return new SlcBinding(stored, stored._id as unknown as ObjectId);
  }

  async findByUserIdAndSourceId(
    userId: ObjectId | string,
    sourceId: string
  ): Promise<SlcBinding | null> {
    const doc = await this._collection.findOne({ userId, sourceId });
    if (!doc) return null;
    return new SlcBinding(doc, doc._id as unknown as ObjectId);
  }

  async findByStudentId(
    userId: ObjectId | string,
    studentId: ObjectId | string
  ): Promise<readonly SlcBinding[]> {
    const studentKey =
      typeof studentId === 'string' && MongoObjectId.isValid(studentId)
        ? new MongoObjectId(studentId)
        : studentId;
    const docs = await this._collection.find({ userId, studentId: studentKey }).toArray();
    return docs.map((d) => new SlcBinding(d, d._id as unknown as ObjectId));
  }

  async hasBindingForSourceStudent(
    userId: ObjectId | string,
    sourceId: string,
    studentExternalId: string
  ): Promise<boolean> {
    const doc = await this._collection.findOne({ userId, sourceId, studentExternalId });
    return doc != null;
  }
}
