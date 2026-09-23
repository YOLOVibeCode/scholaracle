import type { ObjectId } from 'mongodb';

export interface ICourseTutorialOverrideData {
  readonly userId: ObjectId | string;
  readonly studentId: ObjectId | string;
  readonly mergedCourseId: string;
  readonly tutorialWindow: string;
  readonly tutorialManualAt: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class CourseTutorialOverride {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
  public readonly studentId: ObjectId | string;
  public readonly mergedCourseId: string;
  public readonly tutorialWindow: string;
  public readonly tutorialManualAt: Date;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: ICourseTutorialOverrideData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.studentId = data.studentId;
    this.mergedCourseId = data.mergedCourseId;
    this.tutorialWindow = data.tutorialWindow;
    this.tutorialManualAt = data.tutorialManualAt;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
