import type { ObjectId } from 'mongodb';
import type { CommunicationChannel, CommunicationType } from '../CommunicationLog/CommunicationLog';

/**
 * Communication template data interface.
 */
export interface ICommunicationTemplateData {
  readonly name: string;
  readonly channel: CommunicationChannel;
  readonly type: CommunicationType;
  readonly subject: string;
  readonly content: string;
  readonly isActive?: boolean;
  readonly createdByAdminId?: string;
  readonly createdByAdminEmail?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Communication template model for reusable admin messages.
 */
export class CommunicationTemplate {
  public readonly _id?: ObjectId;
  public readonly name: string;
  public readonly channel: CommunicationChannel;
  public readonly type: CommunicationType;
  public readonly subject: string;
  public readonly content: string;
  public readonly isActive: boolean;
  public readonly createdByAdminId?: string;
  public readonly createdByAdminEmail?: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: ICommunicationTemplateData, id?: ObjectId) {
    this._id = id;
    this.name = data.name;
    this.channel = data.channel;
    this.type = data.type;
    this.subject = data.subject;
    this.content = data.content;
    this.isActive = data.isActive ?? true;
    this.createdByAdminId = data.createdByAdminId;
    this.createdByAdminEmail = data.createdByAdminEmail;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
