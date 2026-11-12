import type { ObjectId } from 'mongodb';

export interface ISlcBindingData {
  readonly userId: ObjectId | string;
  readonly portalAccountId: string;
  readonly studentId: ObjectId | string;
  readonly sourceId: string;
  readonly studentExternalId: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class SlcBinding {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
  public readonly portalAccountId: string;
  public readonly studentId: ObjectId | string;
  public readonly sourceId: string;
  public readonly studentExternalId: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: ISlcBindingData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.portalAccountId = data.portalAccountId;
    this.studentId = data.studentId;
    this.sourceId = data.sourceId;
    this.studentExternalId = data.studentExternalId;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
