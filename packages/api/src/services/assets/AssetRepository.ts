import type { Db } from 'mongodb';

export interface IAssetDocument {
  readonly assetId: string;
  readonly sourceId: string;
  readonly userId: string;
  readonly originalUrl: string;
  readonly storageKey: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly contentHash: string;
  readonly uploadedAt: Date;
  readonly lastAccessedAt: Date;
  readonly entityType: string;
  readonly entityExternalId: string;
  readonly courseExternalId?: string;
  readonly academicTermId?: string;
  readonly expiresAt?: Date;
  readonly deletedAt?: Date;
}

/** Read-only asset lookups. */
export interface IAssetReader {
  findByAssetId(assetId: string): Promise<IAssetDocument | null>;
  findBySourceIdAndHash(sourceId: string, contentHash: string): Promise<IAssetDocument | null>;
  findSoftDeletedBefore(before: Date): Promise<readonly IAssetDocument[]>;
}

/** Asset writes: insert, touch, soft/hard delete. */
export interface IAssetWriter {
  insert(doc: Omit<IAssetDocument, 'uploadedAt' | 'lastAccessedAt'>): Promise<void>;
  updateLastAccessed(assetId: string): Promise<void>;
  softDeleteBySourceId(userId: string, sourceId: string): Promise<number>;
  softDeleteByTerm(userId: string, sourceId: string, academicTermId: string): Promise<number>;
  softDeleteByTermIds(
    userId: string,
    sourceId: string,
    academicTermIds: readonly string[]
  ): Promise<number>;
  softDeleteByEntity(
    userId: string,
    sourceId: string,
    entityType: string,
    entityExternalId: string
  ): Promise<number>;
  softDeleteByCourse(userId: string, sourceId: string, courseExternalId: string): Promise<number>;
  softDeleteByAge(
    userId: string,
    sourceId: string,
    uploadedBefore: Date,
    lastAccessedBefore: Date
  ): Promise<number>;
  hardDelete(assetId: string): Promise<void>;
}

const COLLECTION = 'slc_assets';

export class AssetRepository implements IAssetReader, IAssetWriter {
  private readonly _db: Db;

  constructor(database: Db) {
    this._db = database;
  }

  async findByAssetId(assetId: string): Promise<IAssetDocument | null> {
    const doc = await this._db.collection(COLLECTION).findOne({ assetId, deletedAt: null });
    return doc as IAssetDocument | null;
  }

  async findBySourceIdAndHash(
    sourceId: string,
    contentHash: string
  ): Promise<IAssetDocument | null> {
    const doc = await this._db
      .collection(COLLECTION)
      .findOne({ sourceId, contentHash, deletedAt: null });
    return doc as IAssetDocument | null;
  }

  async insert(doc: Omit<IAssetDocument, 'uploadedAt' | 'lastAccessedAt'>): Promise<void> {
    const now = new Date();
    await this._db.collection(COLLECTION).insertOne({
      ...doc,
      uploadedAt: now,
      lastAccessedAt: now,
    });
  }

  async updateLastAccessed(assetId: string): Promise<void> {
    await this._db
      .collection(COLLECTION)
      .updateOne({ assetId }, { $set: { lastAccessedAt: new Date() } });
  }

  async softDeleteBySourceId(userId: string, sourceId: string): Promise<number> {
    const r = await this._db
      .collection(COLLECTION)
      .updateMany({ userId, sourceId, deletedAt: null }, { $set: { deletedAt: new Date() } });
    return r.modifiedCount;
  }

  async softDeleteByTerm(
    userId: string,
    sourceId: string,
    academicTermId: string
  ): Promise<number> {
    const r = await this._db
      .collection(COLLECTION)
      .updateMany(
        { userId, sourceId, academicTermId, deletedAt: null },
        { $set: { deletedAt: new Date() } }
      );
    return r.modifiedCount;
  }

  /**
   * Soft-delete assets whose academicTermId is in the given set (e.g. term + all grading periods under it).
   */
  async softDeleteByTermIds(
    userId: string,
    sourceId: string,
    academicTermIds: readonly string[]
  ): Promise<number> {
    if (academicTermIds.length === 0) return 0;
    const r = await this._db.collection(COLLECTION).updateMany(
      {
        userId,
        sourceId,
        academicTermId: { $in: [...academicTermIds] },
        deletedAt: null,
      },
      { $set: { deletedAt: new Date() } }
    );
    return r.modifiedCount;
  }

  /**
   * Soft-delete assets tied to a specific entity (assignment, message, or courseMaterial).
   * Used when that subject/entity is deleted in ingest.
   */
  async softDeleteByEntity(
    userId: string,
    sourceId: string,
    entityType: string,
    entityExternalId: string
  ): Promise<number> {
    const r = await this._db
      .collection(COLLECTION)
      .updateMany(
        { userId, sourceId, entityType, entityExternalId, deletedAt: null },
        { $set: { deletedAt: new Date() } }
      );
    return r.modifiedCount;
  }

  /**
   * Soft-delete all assets for a course (subject) when the course is deleted.
   * Subjects are related to terms (semester/quarter/grading period); this removes assets for that subject.
   */
  async softDeleteByCourse(
    userId: string,
    sourceId: string,
    courseExternalId: string
  ): Promise<number> {
    const r = await this._db
      .collection(COLLECTION)
      .updateMany(
        { userId, sourceId, courseExternalId, deletedAt: null },
        { $set: { deletedAt: new Date() } }
      );
    return r.modifiedCount;
  }

  async softDeleteByAge(
    userId: string,
    sourceId: string,
    uploadedBefore: Date,
    lastAccessedBefore: Date
  ): Promise<number> {
    const r = await this._db.collection(COLLECTION).updateMany(
      {
        userId,
        sourceId,
        deletedAt: null,
        uploadedAt: { $lt: uploadedBefore },
        lastAccessedAt: { $lt: lastAccessedBefore },
      },
      { $set: { deletedAt: new Date() } }
    );
    return r.modifiedCount;
  }

  async findSoftDeletedBefore(before: Date): Promise<readonly IAssetDocument[]> {
    const cursor = this._db.collection(COLLECTION).find({ deletedAt: { $ne: null, $lt: before } });
    const list = await cursor.toArray();
    return list as unknown as IAssetDocument[];
  }

  async hardDelete(assetId: string): Promise<void> {
    await this._db.collection(COLLECTION).deleteOne({ assetId });
  }
}
