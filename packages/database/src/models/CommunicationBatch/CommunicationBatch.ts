import type { ObjectId } from 'mongodb';
import type { CommunicationChannel, CommunicationType } from '../CommunicationLog/CommunicationLog';

export type CommunicationBatchStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ICommunicationBatchCriteria {
  readonly role?: string;
  readonly emails?: readonly string[];
}

export interface ICommunicationBatchData {
  readonly status: CommunicationBatchStatus;
  readonly criteria: ICommunicationBatchCriteria;

  // Message
  readonly channel: CommunicationChannel;
  readonly type: CommunicationType;
  readonly subject: string;
  readonly content: string;
  readonly templateId?: string;
  readonly templateName?: string;

  // Counts
  readonly totalRecipients: number;
  readonly sentCount?: number;
  readonly failedCount?: number;

  // Actor
  readonly createdByAdminId?: string;
  readonly createdByAdminEmail?: string;

  readonly createdAt?: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly updatedAt?: Date;
}

export class CommunicationBatch {
  public readonly _id?: ObjectId;
  public readonly status: CommunicationBatchStatus;
  public readonly criteria: ICommunicationBatchCriteria;
  public readonly channel: CommunicationChannel;
  public readonly type: CommunicationType;
  public readonly subject: string;
  public readonly content: string;
  public readonly templateId?: string;
  public readonly templateName?: string;
  public readonly totalRecipients: number;
  public readonly sentCount: number;
  public readonly failedCount: number;
  public readonly createdByAdminId?: string;
  public readonly createdByAdminEmail?: string;
  public readonly createdAt: Date;
  public readonly startedAt?: Date;
  public readonly completedAt?: Date;
  public readonly updatedAt: Date;

  constructor(data: ICommunicationBatchData, id?: ObjectId) {
    const now = new Date();
    this._id = id;
    this.status = data.status;
    this.criteria = data.criteria;
    this.channel = data.channel;
    this.type = data.type;
    this.subject = data.subject;
    this.content = data.content;
    this.templateId = data.templateId;
    this.templateName = data.templateName;
    this.totalRecipients = data.totalRecipients;
    this.sentCount = data.sentCount ?? 0;
    this.failedCount = data.failedCount ?? 0;
    this.createdByAdminId = data.createdByAdminId;
    this.createdByAdminEmail = data.createdByAdminEmail;
    this.createdAt = data.createdAt ?? now;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
    this.updatedAt = data.updatedAt ?? now;
  }
}


