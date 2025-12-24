import type { ObjectId } from 'mongodb';

/**
 * Admin note category types.
 */
export type AdminNoteCategory = 'general' | 'billing' | 'support' | 'technical' | 'compliance';

/**
 * Admin note data interface.
 */
export interface IAdminNoteData {
  readonly userId: string;
  readonly adminUserId: string;
  readonly adminName?: string;
  readonly content: string;
  readonly category: AdminNoteCategory;
  readonly isInternal?: boolean;
  readonly isPinned?: boolean;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Admin note model for customer notes by admins.
 */
export class AdminNote {
  public readonly _id?: ObjectId;
  public readonly userId: string;
  public readonly adminUserId: string;
  public readonly adminName?: string;
  public readonly content: string;
  public readonly category: AdminNoteCategory;
  public readonly isInternal: boolean;
  public readonly isPinned: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IAdminNoteData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.adminUserId = data.adminUserId;
    this.adminName = data.adminName;
    this.content = data.content;
    this.category = data.category;
    this.isInternal = data.isInternal ?? true;
    this.isPinned = data.isPinned ?? false;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}


