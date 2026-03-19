import type { ObjectId } from 'mongodb';

/**
 * Communication channel types.
 */
export type CommunicationChannel = 'email' | 'sms' | 'push' | 'in_app' | 'phone' | 'support_ticket';

/**
 * Communication type categories.
 */
export type CommunicationType =
  | 'notification'
  | 'marketing'
  | 'support'
  | 'billing'
  | 'system'
  | 'alert';

/**
 * Communication delivery status.
 */
export type CommunicationStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'bounced'
  | 'opened'
  | 'clicked'
  | 'preview';

/**
 * Communication trigger source.
 */
export type CommunicationTrigger = 'system' | 'admin' | 'user_action' | 'scheduled' | 'webhook';

/**
 * Communication log data interface.
 */
export interface ICommunicationLogData {
  readonly userId: string;
  readonly channel: CommunicationChannel;
  readonly type: CommunicationType;

  // Content
  readonly subject?: string;
  readonly content: string;
  readonly htmlContent?: string;
  readonly templateId?: string;
  readonly templateName?: string;

  // Recipient
  readonly recipientEmail?: string;
  readonly recipientPhone?: string;

  // Delivery Status
  readonly status: CommunicationStatus;
  readonly sentAt?: Date;
  readonly deliveredAt?: Date;
  readonly openedAt?: Date;
  readonly clickedAt?: Date;
  readonly failedAt?: Date;
  readonly failureReason?: string;

  // Metadata
  readonly triggeredBy: CommunicationTrigger;
  readonly adminUserId?: string;
  readonly relatedEntityType?: string;
  readonly relatedEntityId?: string;

  // Provider Details
  readonly providerId?: string;
  readonly providerResponse?: Record<string, unknown>;

  readonly createdAt?: Date;
}

/**
 * Communication log model for tracking all customer communications.
 */
export class CommunicationLog {
  public readonly _id?: ObjectId;
  public readonly userId: string;
  public readonly channel: CommunicationChannel;
  public readonly type: CommunicationType;
  public readonly subject?: string;
  public readonly content: string;
  public readonly htmlContent?: string;
  public readonly templateId?: string;
  public readonly templateName?: string;
  public readonly recipientEmail?: string;
  public readonly recipientPhone?: string;
  public readonly status: CommunicationStatus;
  public readonly sentAt?: Date;
  public readonly deliveredAt?: Date;
  public readonly openedAt?: Date;
  public readonly clickedAt?: Date;
  public readonly failedAt?: Date;
  public readonly failureReason?: string;
  public readonly triggeredBy: CommunicationTrigger;
  public readonly adminUserId?: string;
  public readonly relatedEntityType?: string;
  public readonly relatedEntityId?: string;
  public readonly providerId?: string;
  public readonly providerResponse: Record<string, unknown>;
  public readonly createdAt: Date;

  constructor(data: ICommunicationLogData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.channel = data.channel;
    this.type = data.type;
    this.subject = data.subject;
    this.content = data.content;
    this.htmlContent = data.htmlContent;
    this.templateId = data.templateId;
    this.templateName = data.templateName;
    this.recipientEmail = data.recipientEmail;
    this.recipientPhone = data.recipientPhone;
    this.status = data.status;
    this.sentAt = data.sentAt;
    this.deliveredAt = data.deliveredAt;
    this.openedAt = data.openedAt;
    this.clickedAt = data.clickedAt;
    this.failedAt = data.failedAt;
    this.failureReason = data.failureReason;
    this.triggeredBy = data.triggeredBy;
    this.adminUserId = data.adminUserId;
    this.relatedEntityType = data.relatedEntityType;
    this.relatedEntityId = data.relatedEntityId;
    this.providerId = data.providerId;
    this.providerResponse = data.providerResponse ?? {};
    this.createdAt = data.createdAt ?? new Date();
  }

  /**
   * Check if communication was successfully delivered.
   */
  public wasDelivered(): boolean {
    return ['delivered', 'opened', 'clicked'].includes(this.status);
  }

  /**
   * Check if communication failed.
   */
  public hasFailed(): boolean {
    return ['failed', 'bounced'].includes(this.status);
  }

  /**
   * Check if communication was opened/read.
   */
  public wasOpened(): boolean {
    return ['opened', 'clicked'].includes(this.status);
  }

  /**
   * Get channel display name.
   */
  public getChannelDisplayName(): string {
    const names: Record<CommunicationChannel, string> = {
      email: 'Email',
      sms: 'SMS',
      push: 'Push Notification',
      in_app: 'In-App',
      phone: 'Phone Call',
      support_ticket: 'Support Ticket',
    };
    return names[this.channel];
  }
}
