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

/** Alert channels an adult may choose for a student. `push` goes to that person's own devices. */
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
  /** Channels for alert delivery. Set to ['email', 'push'] when the invitation is accepted. */
  readonly alertChannels?: readonly SharedAlertChannel[];
  /** Alert types to receive (undefined = all). */
  readonly alertTypes?: readonly string[];
  /**
   * Send this adult a copy of the student's Sunday weekly review by their alert channels
   * (student review spec §3.3, decision Q2). Off unless explicitly true.
   */
  readonly weeklyReviewCopy?: boolean;
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
  /** Account id of this person; set for the owner and every accepted adult (push goes to its devices). */
  readonly userId?: string;
  readonly channels: readonly SharedAlertChannel[];
  readonly alertTypes?: readonly string[];
  readonly isPrimary: boolean;
}

/** Owner's per-student alert preferences. */
export interface IOwnerAlertPrefs {
  readonly receiveAlerts: boolean;
  readonly alertChannels: readonly SharedAlertChannel[];
  readonly alertTypes?: readonly string[];
  /** Copy of the student's weekly review to the owner (spec §3.3 Q2). Off unless true. */
  readonly weeklyReviewCopy?: boolean;
}

/** One person's alert preferences for a student (owner or accepted adult), as the resolver reads them. */
export interface IPersonAlertPrefs {
  readonly receiveAlerts: boolean;
  readonly alertChannels: readonly SharedAlertChannel[];
  readonly alertTypes?: readonly string[];
  /** Copy of the student's Sunday weekly review (student review §3.3 Q2). Off unless true. */
  readonly weeklyReviewCopy: boolean;
}

/** The owner's channels when they never set any (unchanged product default). */
export const DEFAULT_OWNER_ALERT_CHANNELS: readonly SharedAlertChannel[] = ['email'];

/**
 * A shared adult's channels when the invitation chose none (sharing-spec §8 Q4). Written at
 * accept time and used as the read-time default, so storage, delivery and display agree.
 */
export const DEFAULT_SHARED_ALERT_CHANNELS: readonly SharedAlertChannel[] = ['email', 'push'];

/** The owner's effective alert preferences for a student. */
export function effectiveOwnerAlertPrefs(prefs: IOwnerAlertPrefs | undefined): IPersonAlertPrefs {
  return {
    receiveAlerts: prefs?.receiveAlerts !== false,
    alertChannels: prefs?.alertChannels ?? DEFAULT_OWNER_ALERT_CHANNELS,
    ...(prefs?.alertTypes !== undefined ? { alertTypes: prefs.alertTypes } : {}),
    weeklyReviewCopy: prefs?.weeklyReviewCopy === true,
  };
}

/** A shared adult's effective alert preferences for a student (pending or accepted row). */
export function effectiveSharedAlertPrefs(
  row: Pick<ISharedParent, 'receiveAlerts' | 'alertChannels' | 'alertTypes' | 'weeklyReviewCopy'>
): IPersonAlertPrefs {
  return {
    receiveAlerts: row.receiveAlerts !== false,
    alertChannels: row.alertChannels ?? DEFAULT_SHARED_ALERT_CHANNELS,
    ...(row.alertTypes !== undefined ? { alertTypes: row.alertTypes } : {}),
    weeklyReviewCopy: row.weeklyReviewCopy === true,
  };
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
    const ownerPrefs = effectiveOwnerAlertPrefs(this.ownerAlertPrefs);
    if (ownerPrefs.receiveAlerts) {
      out.push({
        email: ownerEmail,
        phone: ownerPhone,
        userId: this.userId.toString(),
        channels: ownerPrefs.alertChannels,
        alertTypes: ownerPrefs.alertTypes,
        isPrimary: true,
      });
    }
    for (const sp of this.sharedWith) {
      if (sp.status !== 'accepted') continue;
      const prefs = effectiveSharedAlertPrefs(sp);
      if (!prefs.receiveAlerts) continue;
      out.push({
        email: sp.email,
        phone: sp.phone,
        name: sp.name,
        ...(sp.userId ? { userId: sp.userId } : {}),
        channels: prefs.alertChannels,
        alertTypes: prefs.alertTypes,
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

  /**
   * The caller's own alert preferences for this student, or null when they have no access
   * (sharing-spec §4.5). Owner: `ownerAlertPrefs`; accepted adult: their `sharedWith` row.
   * `receiveAlerts: false` or no channels means the person has silenced this student.
   */
  public alertPrefsFor(userId: string): IPersonAlertPrefs | null {
    if (this.isOwner(userId)) return effectiveOwnerAlertPrefs(this.ownerAlertPrefs);
    const row = this.sharedWith.find((sp) => sp.status === 'accepted' && sp.userId === userId);
    return row ? effectiveSharedAlertPrefs(row) : null;
  }
}
