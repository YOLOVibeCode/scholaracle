import type { ObjectId } from 'mongodb';
import type { IAlertData } from '@scholaracle/interfaces';

/**
 * Alert model representing a notification/alert for a student.
 */
export class Alert {
  public readonly _id?: ObjectId;
  public readonly studentId: string;
  public readonly userId: string;
  public readonly type: string;
  public readonly severity: string;
  public readonly message: string;
  public readonly relatedData: Record<string, unknown>;
  public readonly acknowledged: boolean;
  public readonly acknowledgedAt?: Date;
  public readonly createdAt: Date;

  constructor(data: IAlertData, id?: ObjectId) {
    this._id = id;
    this.studentId = data.studentId;
    this.userId = data.userId;
    this.type = data.type;
    this.severity = data.severity;
    this.message = data.message;
    this.relatedData = data.relatedData ?? {};
    this.acknowledged = data.acknowledged ?? false;
    this.acknowledgedAt = data.acknowledgedAt;
    this.createdAt = data.createdAt ?? new Date();
  }
}
