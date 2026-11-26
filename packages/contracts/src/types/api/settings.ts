/**
 * Wire contract for GET/PUT /api/settings (notification + alert preferences).
 *
 * Server is source of truth: packages/api/src/routes/settings/settings.ts.
 */

export interface ISettingsQuietHours {
  readonly enabled: boolean;
  /** HH:mm, 24-hour. */
  readonly start: string;
  /** HH:mm, 24-hour. */
  readonly end: string;
  readonly criticalOverride: boolean;
}

export interface ISettingsDigestSchedule {
  readonly daily?: { readonly enabled: boolean; readonly time: string };
  readonly weekly?: {
    readonly enabled: boolean;
    readonly day: string;
    readonly time: string;
  };
}

export interface ISettingsNotifications {
  readonly push: boolean;
  readonly email: boolean;
  readonly sms: boolean;
  readonly inApp?: boolean;
  readonly quietHours?: ISettingsQuietHours;
  readonly digestSchedule?: ISettingsDigestSchedule;
}

export interface ISettingsAlertTypePref {
  readonly enabled: boolean;
  readonly severity: string;
}

export interface ISettingsAlerts {
  readonly gradeDrop: number;
  readonly daysBeforeDeadline: number;
  readonly lowGradeThreshold: number;
  readonly enabledTypes?: Readonly<Record<string, ISettingsAlertTypePref>>;
}

/** Subset of the GET /api/settings response the notification screens read. */
/** Account fields GET /api/settings returns beside the preferences. */
export interface IUserSettingsProfile {
  readonly name?: string;
  readonly email?: string;
  /** E.164, or '' when none is on file. */
  readonly phone: string;
  /** True once the parent ticked the text-message consent box. */
  readonly smsConsent: boolean;
}

export interface IUserSettingsResponse {
  /** IANA timezone. */
  readonly timezone?: string;
  readonly profile?: IUserSettingsProfile;
  readonly notifications: ISettingsNotifications;
  readonly alerts: ISettingsAlerts;
}

/**
 * Body of PUT /api/settings. Every field is optional and merged server-side;
 * `quietHours` and each `digestSchedule` sub-object replace wholesale.
 */
export interface IUserSettingsUpdateRequest {
  readonly timezone?: string;
  readonly notifications?: Partial<Omit<ISettingsNotifications, 'inApp'>>;
  readonly alerts?: Partial<ISettingsAlerts>;
  /** Phone number and text-message consent; the server records the opt-in when consent is true. */
  readonly profile?: { readonly phone?: string; readonly smsConsent?: boolean };
}
