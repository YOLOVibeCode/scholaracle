import { v4 as uuidv4 } from 'uuid';
import { NotificationPriority } from '../enums/NotificationPriority';
import { NotificationChannel } from '../enums/NotificationChannel';
import { AgentType } from '../enums/AgentType';

export interface NotificationData {
  readonly id?: string;
  readonly agentType: AgentType;
  readonly studentId: string;
  readonly userId: string;
  readonly subject: string;
  readonly body: string;
  readonly priority: NotificationPriority;
  readonly triggerType: string;
  readonly triggerData?: unknown;
  readonly channels?: NotificationChannel[];
  readonly scheduledFor?: Date;
  readonly actions?: NotificationAction[];
}

/** Serializable payload for queue/worker; includes id for idempotency. */
export interface INotificationPayload {
  readonly id: string;
  readonly agentType: AgentType;
  readonly studentId: string;
  readonly userId: string;
  readonly subject: string;
  readonly body: string;
  readonly priority: NotificationPriority;
  readonly triggerType: string;
  readonly triggerData?: unknown;
  readonly actions?: NotificationAction[];
  readonly channels?: NotificationChannel[];
}

export interface NotificationAction {
  readonly label: string;
  readonly type: 'link' | 'button';
  readonly url?: string;
  readonly action?: string;
}

/**
 * Represents a notification ready for delivery.
 */
export class Notification {
  public readonly id: string;
  public readonly agentType: AgentType;
  public readonly studentId: string;
  public readonly userId: string;
  public subject: string;
  public body: string;
  public readonly priority: NotificationPriority;
  public readonly triggerType: string;
  public readonly triggerData?: unknown;
  public readonly channels: NotificationChannel[];
  public readonly scheduledFor: Date;
  public readonly actions: NotificationAction[];
  public readonly createdAt: Date;

  public sentAt?: Date;
  public deliveredAt?: Date;
  public openedAt?: Date;
  public actionTakenAt?: Date;

  constructor(data: NotificationData) {
    this._validate(data);

    this.id = data.id ?? uuidv4();
    this.agentType = data.agentType;
    this.studentId = data.studentId;
    this.userId = data.userId;
    this.subject = data.subject;
    this.body = data.body;
    this.priority = data.priority;
    this.triggerType = data.triggerType;
    this.triggerData = data.triggerData;
    this.channels = data.channels ?? this._getDefaultChannels(data.priority);
    this.scheduledFor = data.scheduledFor ?? new Date();
    this.actions = data.actions ?? [];
    this.createdAt = new Date();
  }

  public markSent(): void {
    this.sentAt = new Date();
  }

  public markDelivered(): void {
    this.deliveredAt = new Date();
  }

  public markOpened(): void {
    this.openedAt = new Date();
  }

  public markActionTaken(): void {
    this.actionTakenAt = new Date();
  }

  public updateContent(subject: string, body: string): void {
    this.subject = subject;
    this.body = body;
  }

  /**
   * Build a Notification from a serialized payload (e.g. from a deliver job).
   * Used when reconstructing for DeliveryRouter.route in two-phase delivery.
   */
  public static fromPayload(payload: INotificationPayload): Notification {
    return new Notification({
      id: payload.id,
      agentType: payload.agentType,
      studentId: payload.studentId,
      userId: payload.userId,
      subject: payload.subject,
      body: payload.body,
      priority: payload.priority,
      triggerType: payload.triggerType,
      triggerData: payload.triggerData,
      actions: payload.actions,
      channels: payload.channels,
    });
  }

  private _validate(data: NotificationData): void {
    const required: Array<keyof NotificationData> = [
      'agentType',
      'studentId',
      'userId',
      'subject',
      'body',
      'priority',
      'triggerType',
    ];

    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
  }

  private _getDefaultChannels(priority: NotificationPriority): NotificationChannel[] {
    switch (priority) {
      case NotificationPriority.CRITICAL:
        return [NotificationChannel.PUSH, NotificationChannel.EMAIL, NotificationChannel.SMS];
      case NotificationPriority.HIGH:
        return [NotificationChannel.PUSH, NotificationChannel.EMAIL];
      case NotificationPriority.MEDIUM:
        return [NotificationChannel.EMAIL, NotificationChannel.IN_APP];
      case NotificationPriority.LOW:
        return [NotificationChannel.IN_APP];
    }
  }
}
