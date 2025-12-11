import type { ObjectId } from 'mongodb';

export interface IUserPreferences {
  readonly notifications: {
    readonly push: boolean;
    readonly email: boolean;
    readonly sms: boolean;
    readonly quietHours?: {
      readonly enabled: boolean;
      readonly start: string;
      readonly end: string;
      readonly criticalOverride: boolean;
    };
    readonly digestSchedule?: {
      readonly daily?: { readonly enabled: boolean; readonly time: string };
      readonly weekly?: {
        readonly enabled: boolean;
        readonly day: string;
        readonly time: string;
      };
    };
    readonly tone?: 'formal' | 'casual' | 'encouraging';
    readonly frequency?: 'minimal' | 'balanced' | 'proactive';
  };
  readonly alerts?: {
    readonly gradeDrop?: number;
    readonly daysBeforeDeadline?: number;
    readonly lowGradeThreshold?: number;
    readonly prioritizeHighImpact?: boolean;
    readonly emphasizeWeakSubjects?: boolean;
    readonly celebrateWins?: boolean;
  };
}

export interface IUserDevice {
  readonly deviceId: string;
  readonly type: 'ios' | 'android' | 'web';
  readonly pushToken?: string;
  readonly lastActive: Date;
}

export interface IUserSubscription {
  readonly plan: 'free' | 'premium' | 'family';
  readonly status: 'active' | 'cancelled' | 'expired';
  readonly expiresAt?: Date;
}

export interface IUserData {
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly phone?: string;
  readonly phoneVerified?: boolean;
  readonly preferences?: IUserPreferences;
  readonly devices?: readonly IUserDevice[];
  readonly subscription?: IUserSubscription;
  readonly isSuspended?: boolean;
  readonly suspendedReason?: string;
  readonly suspendedAt?: Date;
  readonly suspendedBy?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * User model representing a parent/guardian account.
 */
export class User {
  public readonly _id?: ObjectId;
  public readonly email: string;
  public readonly passwordHash: string;
  public readonly name: string;
  public readonly phone?: string;
  public readonly phoneVerified: boolean;
  public readonly preferences: IUserPreferences;
  public readonly devices: readonly IUserDevice[];
  public readonly subscription: IUserSubscription;
  public readonly isSuspended: boolean;
  public readonly suspendedReason?: string;
  public readonly suspendedAt?: Date;
  public readonly suspendedBy?: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IUserData, id?: ObjectId) {
    this._id = id;
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.name = data.name;
    this.phone = data.phone;
    this.phoneVerified = data.phoneVerified ?? false;
    this.preferences = data.preferences ?? this._getDefaultPreferences();
    this.devices = data.devices ?? [];
    this.subscription = data.subscription ?? {
      plan: 'free',
      status: 'active',
    };
    this.isSuspended = data.isSuspended ?? false;
    this.suspendedReason = data.suspendedReason;
    this.suspendedAt = data.suspendedAt;
    this.suspendedBy = data.suspendedBy;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /**
   * Get default user preferences.
   *
   * @returns Default preferences
   */
  private _getDefaultPreferences(): IUserPreferences {
    return {
      notifications: {
        push: true,
        email: true,
        sms: false,
        quietHours: {
          enabled: true,
          start: '22:00',
          end: '07:00',
          criticalOverride: true,
        },
        digestSchedule: {
          daily: { enabled: true, time: '07:00' },
          weekly: { enabled: true, day: 'sunday', time: '18:00' },
        },
        tone: 'encouraging',
        frequency: 'balanced',
      },
      alerts: {
        gradeDrop: 5,
        daysBeforeDeadline: 2,
        lowGradeThreshold: 80,
        prioritizeHighImpact: true,
        emphasizeWeakSubjects: true,
        celebrateWins: true,
      },
    };
  }
}
