import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { Student, type IStudentData } from '../../models/Student';

export interface IStudentReader {
  findById(id: string | ObjectId): Promise<Student | null>;
  findByUserId(userId: string | ObjectId): Promise<readonly Student[]>;
}

export interface IStudentWriter {
  create(studentData: IStudentData): Promise<Student>;
  update(id: string | ObjectId, updates: Partial<IStudentData>): Promise<Student | null>;
  delete(id: string | ObjectId): Promise<boolean>;
}

export interface IStudentRepository extends IStudentReader, IStudentWriter {}

/**
 * Repository for Student model operations.
 */
export class StudentRepository implements IStudentRepository {
  private readonly _collection: Collection<IStudentData & { _id?: ObjectId }>;

  constructor(database: Db) {
    this._collection = database.collection<IStudentData & { _id?: ObjectId }>('students');
  }

  /**
   * Create a new student.
   *
   * @param studentData - Student data
   * @returns Created student
   */
  public async create(studentData: IStudentData): Promise<Student> {
    const now = new Date();
    const userIdObj =
      typeof studentData.userId === 'string'
        ? new ObjectId(studentData.userId)
        : studentData.userId;
    const document = {
      ...studentData,
      userId: userIdObj,
      createdAt: now,
      updatedAt: now,
    };

    const result = await this._collection.insertOne(document);

    return new Student(document, result.insertedId);
  }

  /**
   * Find student by ID.
   *
   * @param id - Student ID
   * @returns Student or null if not found
   */
  public async findById(id: string | ObjectId): Promise<Student | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const document = await this._collection.findOne({ _id: objectId });

    if (!document || !document._id) {
      return null;
    }

    return new Student(document, document._id);
  }

  /**
   * Find students by user ID.
   *
   * @param userId - User ID
   * @returns Array of students
   */
  public async findByUserId(userId: string | ObjectId): Promise<readonly Student[]> {
    const userIdObj = typeof userId === 'string' ? new ObjectId(userId) : userId;
    const documents = await this._collection.find({ userId: userIdObj }).toArray();

    return documents.map((doc) => {
      if (!doc._id) {
        throw new Error('Document missing _id');
      }
      return new Student(doc, doc._id);
    });
  }

  /**
   * Update student.
   *
   * @param id - Student ID
   * @param updates - Update data
   * @returns Updated student or null if not found
   */
  public async update(
    id: string | ObjectId,
    updates: Partial<IStudentData>
  ): Promise<Student | null> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
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

    return new Student(result, result._id);
  }

  /**
   * Delete student.
   *
   * @param id - Student ID
   * @returns True if deleted, false if not found
   */
  public async delete(id: string | ObjectId): Promise<boolean> {
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const result = await this._collection.deleteOne({ _id: objectId });

    return result.deletedCount > 0;
  }
}
