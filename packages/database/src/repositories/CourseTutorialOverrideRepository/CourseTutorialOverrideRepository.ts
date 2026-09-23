import type { Collection, Db, ObjectId } from 'mongodb';
import {
  CourseTutorialOverride,
  type ICourseTutorialOverrideData,
} from '../../models/CourseTutorialOverride/CourseTutorialOverride';

export interface ICourseTutorialOverrideReader {
  findByStudentAndMergedCourse(params: {
    readonly userId: ObjectId | string;
    readonly studentId: ObjectId | string;
    readonly mergedCourseId: string;
  }): Promise<CourseTutorialOverride | null>;
  listByStudent(params: {
    readonly userId: ObjectId | string;
    readonly studentId: ObjectId | string;
  }): Promise<readonly CourseTutorialOverride[]>;
}

export interface ICourseTutorialOverrideWriter {
  upsertManual(params: {
    readonly userId: ObjectId | string;
    readonly studentId: ObjectId | string;
    readonly mergedCourseId: string;
    readonly tutorialWindow: string;
  }): Promise<CourseTutorialOverride>;
  deleteByStudentAndMergedCourse(params: {
    readonly userId: ObjectId | string;
    readonly studentId: ObjectId | string;
    readonly mergedCourseId: string;
  }): Promise<boolean>;
}

export class CourseTutorialOverrideRepository
  implements ICourseTutorialOverrideReader, ICourseTutorialOverrideWriter
{
  private readonly _collection: Collection<ICourseTutorialOverrideData>;

  constructor(database: Db) {
    this._collection = database.collection<ICourseTutorialOverrideData>(
      'course_tutorial_overrides'
    );
  }

  async findByStudentAndMergedCourse(params: {
    readonly userId: ObjectId | string;
    readonly studentId: ObjectId | string;
    readonly mergedCourseId: string;
  }): Promise<CourseTutorialOverride | null> {
    const doc = await this._collection.findOne({
      userId: params.userId,
      studentId: params.studentId,
      mergedCourseId: params.mergedCourseId,
    });
    if (!doc) return null;
    return new CourseTutorialOverride(doc, doc._id as unknown as ObjectId);
  }

  async listByStudent(params: {
    readonly userId: ObjectId | string;
    readonly studentId: ObjectId | string;
  }): Promise<readonly CourseTutorialOverride[]> {
    const docs = await this._collection
      .find({ userId: params.userId, studentId: params.studentId })
      .toArray();
    return docs.map((d) => new CourseTutorialOverride(d, d._id as unknown as ObjectId));
  }

  async upsertManual(params: {
    readonly userId: ObjectId | string;
    readonly studentId: ObjectId | string;
    readonly mergedCourseId: string;
    readonly tutorialWindow: string;
  }): Promise<CourseTutorialOverride> {
    const now = new Date();
    const filter = {
      userId: params.userId,
      studentId: params.studentId,
      mergedCourseId: params.mergedCourseId,
    };
    await this._collection.updateOne(
      filter,
      {
        $set: {
          ...filter,
          tutorialWindow: params.tutorialWindow,
          tutorialManualAt: now,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
    const stored = await this._collection.findOne(filter);
    return new CourseTutorialOverride(
      stored ?? {
        ...filter,
        tutorialWindow: params.tutorialWindow,
        tutorialManualAt: now,
      }
    );
  }

  async deleteByStudentAndMergedCourse(params: {
    readonly userId: ObjectId | string;
    readonly studentId: ObjectId | string;
    readonly mergedCourseId: string;
  }): Promise<boolean> {
    const result = await this._collection.deleteOne({
      userId: params.userId,
      studentId: params.studentId,
      mergedCourseId: params.mergedCourseId,
    });
    return result.deletedCount === 1;
  }
}
