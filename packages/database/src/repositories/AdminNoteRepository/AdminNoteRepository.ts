import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { AdminNote, type IAdminNoteData } from '../../models/AdminNote';

export interface IAdminNoteReader {
  findById(id: string): Promise<AdminNote | null>;
  findByUserId(userId: string): Promise<readonly AdminNote[]>;
}

export interface IAdminNoteWriter {
  create(noteData: IAdminNoteData): Promise<AdminNote>;
  update(id: string, updates: Partial<IAdminNoteData>): Promise<AdminNote | null>;
  delete(id: string): Promise<boolean>;
  togglePin(id: string, pinned: boolean): Promise<boolean>;
}

export interface IAdminNoteRepository extends IAdminNoteReader, IAdminNoteWriter {}

/**
 * Repository for AdminNote model operations.
 */
export class AdminNoteRepository implements IAdminNoteRepository {
  private readonly _collection: Collection<IAdminNoteData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IAdminNoteData & { _id?: ObjectId }>('admin_notes');
  }

  /**
   * Create a new admin note.
   *
   * @param noteData - Note data
   * @returns Created note
   */
  public async create(noteData: IAdminNoteData): Promise<AdminNote> {
    const now = new Date();
    const document = {
      ...noteData,
      isInternal: noteData.isInternal ?? true,
      isPinned: noteData.isPinned ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this._collection.insertOne(document);
    return new AdminNote(document, result.insertedId);
  }

  /**
   * Find admin note by ID.
   *
   * @param id - Note ID
   * @returns Note or null if not found
   */
  public async findById(id: string): Promise<AdminNote | null> {
    const objectId = new ObjectId(id);
    const document = await this._collection.findOne({ _id: objectId });

    if (!document || !document._id) {
      return null;
    }

    return new AdminNote(document, document._id);
  }

  /**
   * Find all notes for a specific user.
   *
   * @param userId - User ID
   * @returns Array of notes (pinned first, then by date)
   */
  public async findByUserId(userId: string): Promise<readonly AdminNote[]> {
    const documents = await this._collection
      .find({ userId })
      .sort({ isPinned: -1, createdAt: -1 })
      .toArray();

    return documents.map((doc) => new AdminNote(doc, doc._id));
  }

  /**
   * Update admin note.
   *
   * @param id - Note ID
   * @param updates - Update data
   * @returns Updated note or null if not found
   */
  public async update(id: string, updates: Partial<IAdminNoteData>): Promise<AdminNote | null> {
    const objectId = new ObjectId(id);
    const updateDoc = {
      ...updates,
      updatedAt: new Date(),
    };

    const result = await this._collection.findOneAndUpdate(
      { _id: objectId },
      { $set: updateDoc },
      { returnDocument: 'after' }
    );

    if (!result || !result._id) {
      return null;
    }

    return new AdminNote(result, result._id);
  }

  /**
   * Delete admin note.
   *
   * @param id - Note ID
   * @returns True if deleted, false if not found
   */
  public async delete(id: string): Promise<boolean> {
    const objectId = new ObjectId(id);
    const result = await this._collection.deleteOne({ _id: objectId });

    return result.deletedCount > 0;
  }

  /**
   * Toggle pin status of a note.
   *
   * @param id - Note ID
   * @param pinned - Pin status
   * @returns True if updated, false if not found
   */
  public async togglePin(id: string, pinned: boolean): Promise<boolean> {
    const objectId = new ObjectId(id);
    const result = await this._collection.updateOne(
      { _id: objectId },
      { $set: { isPinned: pinned, updatedAt: new Date() } }
    );

    return result.modifiedCount > 0;
  }
}
