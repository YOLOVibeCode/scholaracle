import type { ObjectId } from 'mongodb';
import type { IStudentAlertPreferences, ISourceIngestLastCounts } from '@scholaracle/contracts';

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
  /** Portal / institution base URL (may also appear under config.institutionUrl). */
  readonly baseUrl?: string;
  /** Institution external ID used in SLC ops (e.g. "exampleisd.instructure.com"). */
  readonly institutionExternalId?: string;
  readonly provider?: string;
  readonly schedule?: string;
  readonly dataTypes?: readonly string[];
  readonly lastScraped?: Date;
  readonly lastSuccess?: Date;
  /** Canonical successful ingest commit time (ISO-safe when serialized). */
  readonly lastSuccessAt?: Date;
  readonly lastRunId?: string;
  readonly lastCounts?: ISourceIngestLastCounts;
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

/** Alert channels a shared adult may choose. Delivery for `push` lands in sharing S3. */
export type SharedAlertChannel = 'email' | 'sms' | 'push';

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
  /** Phone number for SMS alerts. */
  readonly phone?: string;
  /** Whether to receive alerts (default true when accepted). */
  readonly receiveAlerts?: boolean;
  /** Channels for alert delivery (default ['email']). `push` delivery arrives with sharing S3. */
  readonly alertChannels?: readonly SharedAlertChannel[];
  /** Alert types to receive (undefined = all). */
  readonly alertTypes?: readonly string[];
  /** Groups the entries one invitation created across several students (sharing-spec §4.3). */
  readonly inviteGroupId?: string;
  /** The owner or admin who sent the invitation. */
  readonly invitedByUserId?: string;
  /** Email transfer request. When populated, a transfer is pending for this account. */
  readonly transferRequest?: {
    readonly newEmail: string;
    readonly initiatedAt: Date;
    readonly expiresAt: Date;
    readonly oldEmailToken: string;
    readonly newEmailToken: string;
  };
}

/** Alias for shared parent / contact. */
export type IStudentContact = ISharedParent;

/** Resolved alert recipient for notification delivery. */
export interface IAlertRecipientResolved {
  readonly email: string;
  readonly phone?: string;
  readonly name?: string;
  readonly channels: readonly ('email' | 'sms')[];
  readonly alertTypes?: readonly string[];
  readonly isPrimary: boolean;
}

/** Owner's per-student alert preferences. */
export interface IOwnerAlertPrefs {
  readonly receiveAlerts: boolean;
  readonly alertChannels: readonly ('email' | 'sms')[];
  readonly alertTypes?: readonly string[];
}

/** Parent-provisioned student login bound to this profile. */
export interface IStudentLogin {
  readonly userId: string;
  /** Parent flag. Omitted / undefined is treated as false by the Student constructor. */
  readonly showGrades?: boolean;
  readonly createdAt: Date;
  /** Profile owner who created or last rebound this login. */
  readonly provisionedByUserId?: string;
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
  /** Owner's per-student alert preferences (opt-out, channels). */
  readonly ownerAlertPrefs?: IOwnerAlertPrefs;
  /** Optional email where the student receives alert notifications (same content as parents). */
  readonly alertEmail?: string;
  /** Student-facing login for this profile. Absent until a parent provisions one. */
  readonly studentLogin?: IStudentLogin;
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
  public readonly ownerAlertPrefs?: IOwnerAlertPrefs;
  /** Email where the student receives alert notifications (same content as parents). */
  public readonly alertEmail?: string;
  public readonly studentLogin?: IStudentLogin;
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
    this.ownerAlertPrefs = data.ownerAlertPrefs;
    this.alertEmail = data.alertEmail;
    this.studentLogin = data.studentLogin
      ? {
          userId: data.studentLogin.userId,
          showGrades: data.studentLogin.showGrades === true,
          createdAt: data.studentLogin.createdAt,
          ...(data.studentLogin.provisionedByUserId !== undefined &&
          data.studentLogin.provisionedByUserId !== ''
            ? { provisionedByUserId: data.studentLogin.provisionedByUserId }
            : {}),
        }
      : undefined;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /** Whether a contact with this email exists in sharedWith. */
  public hasContact(email: string): boolean {
    const lower = email.trim().toLowerCase();
    return this.sharedWith.some((sp) => sp.email.trim().toLowerCase() === lower);
  }

  /**
   * Get all alert recipients: owner (if opted in) + accepted contacts with receiveAlerts.
   */
  public getAllAlertRecipients(
    ownerEmail: string,
    ownerPhone?: string
  ): readonly IAlertRecipientResolved[] {
    const out: IAlertRecipientResolved[] = [];
    const ownerOptedOut = this.ownerAlertPrefs?.receiveAlerts === false;
    if (!ownerOptedOut) {
      const channels = this.ownerAlertPrefs?.alertChannels ?? ['email'];
      out.push({
        email: ownerEmail,
        phone: ownerPhone,
        channels,
        alertTypes: this.ownerAlertPrefs?.alertTypes,
        isPrimary: true,
      });
    }
    for (const sp of this.sharedWith) {
      if (sp.status !== 'accepted') continue;
      if (sp.receiveAlerts === false) continue;
      // Push fan-out to shared adults is S3; until then only email/SMS are deliverable channels.
      const channels = (sp.alertChannels ?? ['email']).filter(
        (c): c is 'email' | 'sms' => c === 'email' || c === 'sms'
      );
      out.push({
        email: sp.email,
        phone: sp.phone,
        name: sp.name,
        channels,
        alertTypes: sp.alertTypes,
        isPrimary: false,
      });
    }
    if (this.alertEmail?.trim()) {
      out.push({
        email: this.alertEmail.trim(),
        channels: ['email'],
        isPrimary: false,
      });
    }
    return out;
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
    return this.sharedWith.some((sp) => sp.status === 'accepted' && sp.userId === userId);
  }

  /** Check if a given user ID is the primary owner. */
  public isOwner(userId: string): boolean {
    return this.userId.toString() === userId;
  }

  /**
   * The userId to use as the tenant key for slc_* reads and writes.
   * Always returns the primary owner's userId, regardless of who triggered the operation.
   * Use this after a successful `hasAccess` check instead of the requesting user's id.
   */
  public dataUserId(): string {
    return this.userId.toString();
  }

  /** Check if a given user ID can administer this student (owner or admin-promoted shared parent). */
  public canAdmin(userId: string): boolean {
    if (this.isOwner(userId)) return true;
    return this.sharedWith.some(
      (sp) => sp.status === 'accepted' && sp.userId === userId && sp.isAdmin === true
    );
  }

  /** The caller's level of access, or null when they have none (sharing-spec §4.1). */
  public accessFor(userId: string): 'owner' | 'admin' | 'member' | null {
    if (this.isOwner(userId)) return 'owner';
    const row = this.sharedWith.find((sp) => sp.status === 'accepted' && sp.userId === userId);
    if (!row) return null;
    return row.isAdmin === true ? 'admin' : 'member';
  }

  /** Adults who can see this student: the owner plus every accepted shared adult. */
  public peopleCount(): number {
    return 1 + this.sharedWith.filter((sp) => sp.status === 'accepted').length;
  }
}
