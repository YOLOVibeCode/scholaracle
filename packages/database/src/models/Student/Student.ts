import type { ObjectId } from 'mongodb';
import type { IStudentAlertPreferences } from '@scholaracle/contracts';

export interface IDataSourceCredentials {
  readonly encrypted: string;
  readonly iv: string;
}

export interface IDataSourceConfig {
  readonly institutionUrl?: string;
  readonly username?: string;
  readonly [key: string]: unknown;
}

export interface IDataSource {
  readonly id: string;
  readonly pluginId: string;
  readonly enabled: boolean;
  readonly credentials?: IDataSourceCredentials;
  readonly config?: IDataSourceConfig;
  readonly schedule?: string;
  readonly dataTypes?: readonly string[];
  readonly lastScraped?: Date;
  readonly lastSuccess?: Date;
  readonly lastError?: string | null;
  readonly status?: 'active' | 'error' | 'disabled';
  readonly stats?: {
    readonly totalScrapes?: number;
    readonly successRate?: number;
    readonly avgDuration?: number;
  };
}

export interface IStudentStats {
  readonly currentGPA?: number;
  readonly totalAssignments?: number;
  readonly missingAssignments?: number;
  readonly onTimeRate?: number;
  readonly lastUpdated?: Date;
}

/** A parent/guardian who has shared access to a student. */
export interface ISharedParent {
  /** The user ID of the shared parent. Null if invite is still pending. */
  readonly userId?: string;
  /** Email address the invite was sent to. */
  readonly email: string;
  /** Display name (populated once the user accepts). */
  readonly name?: string;
  /** Role of this shared parent. */
  readonly role: 'parent' | 'guardian' | 'caregiver';
  /** Whether this parent has admin rights (can invite/remove others, same as the primary owner). */
  readonly isAdmin?: boolean;
  /** Invite status. */
  readonly status: 'pending' | 'accepted' | 'declined';
  /** When the invite was sent. */
  readonly invitedAt: Date;
  /** When the invite was accepted (if accepted). */
  readonly acceptedAt?: Date;
}

export interface IStudentData {
  readonly userId: ObjectId | string;
  readonly name: string;
  readonly grade?: number;
  readonly studentId?: string;
  readonly dataSources?: readonly IDataSource[];
  readonly stats?: IStudentStats;
  readonly alertPreferences?: IStudentAlertPreferences;
  /** Additional parents/guardians who have access to this student. */
  readonly sharedWith?: readonly ISharedParent[];
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Student model representing a student profile.
 */
export class Student {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
  public readonly name: string;
  public readonly grade?: number;
  public readonly studentId?: string;
  public readonly dataSources: readonly IDataSource[];
  public readonly stats?: IStudentStats;
  public readonly alertPreferences?: IStudentAlertPreferences;
  public readonly sharedWith: readonly ISharedParent[];
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IStudentData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.name = data.name;
    this.grade = data.grade;
    this.studentId = data.studentId;
    this.dataSources = data.dataSources ?? [];
    this.stats = data.stats;
    this.alertPreferences = data.alertPreferences;
    this.sharedWith = data.sharedWith ?? [];
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /** Get all parent user IDs (primary owner + accepted shared parents). */
  public getAllParentUserIds(): readonly string[] {
    const ids: string[] = [this.userId.toString()];
    for (const sp of this.sharedWith) {
      if (sp.status === 'accepted' && sp.userId) {
        ids.push(sp.userId);
      }
    }
    return ids;
  }

  /** Check if a given user ID has access to this student (owner or shared). */
  public hasAccess(userId: string): boolean {
    if (this.userId.toString() === userId) return true;
    return this.sharedWith.some(
      (sp) => sp.status === 'accepted' && sp.userId === userId
    );
  }

  /** Check if a given user ID is the primary owner. */
  public isOwner(userId: string): boolean {
    return this.userId.toString() === userId;
  }

  /** Check if a given user ID can administer this student (owner or admin-promoted shared parent). */
  public canAdmin(userId: string): boolean {
    if (this.isOwner(userId)) return true;
    return this.sharedWith.some(
      (sp) => sp.status === 'accepted' && sp.userId === userId && sp.isAdmin === true
    );
  }
}
