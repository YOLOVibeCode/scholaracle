import { v4 as uuidv4 } from 'uuid';
import { AlertType } from '../enums/AlertType';

export interface AlertData {
  readonly type: AlertType;
  readonly studentId: string;
  readonly severity: string;
  readonly relatedData: Record<string, unknown>;
  readonly createdAt?: Date;
  /** Parent/user ID who owns this alert (for parent notifications). */
  readonly userId?: string;
}

/**
 * Represents an alert that triggers a notification.
 */
export class Alert {
  public readonly id: string;
  public readonly type: AlertType;
  public readonly studentId: string;
  public readonly severity: string;
  public readonly relatedData: Record<string, unknown>;
  public readonly createdAt: Date;
  public readonly userId?: string;

  constructor(data: AlertData) {
    this._validate(data);

    this.id = uuidv4();
    this.type = data.type;
    this.studentId = data.studentId;
    this.severity = data.severity;
    this.relatedData = data.relatedData;
    this.createdAt = data.createdAt ?? new Date();
    this.userId = data.userId;
  }

  private _validate(data: AlertData): void {
    const required: Array<keyof AlertData> = ['type', 'studentId', 'severity', 'relatedData'];

    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }
}
