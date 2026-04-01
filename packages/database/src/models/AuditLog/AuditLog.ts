import type { ObjectId } from 'mongodb';

/**
 * Audit action categories.
 */
export type AuditAction =
  // Customer actions
  | 'customer:view'
  | 'customer:edit'
  | 'customer:delete'
  | 'customer:suspend'
  | 'customer:unsuspend'
  | 'customer:bulk_suspend'
  | 'customer:bulk_unsuspend'
  | 'customer:bulk_change_plan'
  | 'customer:impersonate'
  | 'customer:set_password'
  | 'customer:send_reset'
  | 'customer:force_reset'
  // Payment actions
  | 'payment:view'
  | 'payment:refund'
  | 'payment:retry'
  // Subscription actions
  | 'subscription:view'
  | 'subscription:upgrade'
  | 'subscription:downgrade'
  | 'subscription:cancel'
  | 'subscription:reactivate'
  | 'subscription:extend_trial'
  // Communication actions
  | 'communication:send'
  | 'communication:bulk_send'
  // Admin actions
  | 'admin:create'
  | 'admin:edit'
  | 'admin:delete'
  | 'admin:login'
  | 'admin:logout'
  | 'admin:mfa_setup'
  // Coupon actions
  | 'coupon:create'
  | 'coupon:update'
  | 'coupon:enable'
  | 'coupon:disable'
  // System actions
  | 'system:config_change'
  | 'system:export';

/**
 * Audit severity levels.
 */
export type AuditSeverity = 'info' | 'warning' | 'critical';

/**
 * Audit log data interface.
 */
export interface IAuditLogData {
  readonly adminUserId: string;
  readonly adminEmail: string;
  readonly action: AuditAction;
  readonly severity?: AuditSeverity;

  // Target entity
  readonly entityType: string;
  readonly entityId?: string;
  readonly entityDescription?: string;

  // Change details
  readonly changes?: {
    readonly field: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }[];

  // Context
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;

  // Request context
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly sessionId?: string;

  readonly timestamp?: Date;
}

/**
 * Audit log model for tracking all admin actions.
 */
export class AuditLog {
  public readonly _id?: ObjectId;
  public readonly adminUserId: string;
  public readonly adminEmail: string;
  public readonly action: AuditAction;
  public readonly severity: AuditSeverity;
  public readonly entityType: string;
  public readonly entityId?: string;
  public readonly entityDescription?: string;
  public readonly changes: {
    readonly field: string;
    readonly oldValue: unknown;
    readonly newValue: unknown;
  }[];
  public readonly reason?: string;
  public readonly metadata: Record<string, unknown>;
  public readonly ipAddress: string;
  public readonly userAgent: string;
  public readonly sessionId?: string;
  public readonly timestamp: Date;

  constructor(data: IAuditLogData, id?: ObjectId) {
    this._id = id;
    this.adminUserId = data.adminUserId;
    this.adminEmail = data.adminEmail;
    this.action = data.action;
    this.severity = data.severity ?? this._determineSeverity(data.action);
    this.entityType = data.entityType;
    this.entityId = data.entityId;
    this.entityDescription = data.entityDescription;
    this.changes = data.changes ?? [];
    this.reason = data.reason;
    this.metadata = data.metadata ?? {};
    this.ipAddress = data.ipAddress;
    this.userAgent = data.userAgent;
    this.sessionId = data.sessionId;
    this.timestamp = data.timestamp ?? new Date();
  }

  /**
   * Determine severity based on action type.
   */
  private _determineSeverity(action: AuditAction): AuditSeverity {
    const criticalActions: AuditAction[] = [
      'customer:delete',
      'customer:impersonate',
      'payment:refund',
      'admin:delete',
      'system:config_change',
    ];

    const warningActions: AuditAction[] = [
      'customer:suspend',
      'subscription:cancel',
      'admin:create',
      'admin:edit',
    ];

    if (criticalActions.includes(action)) return 'critical';
    if (warningActions.includes(action)) return 'warning';
    return 'info';
  }

  /**
   * Get human-readable action description.
   */
  public getActionDescription(): string {
    const descriptions: Record<AuditAction, string> = {
      'customer:view': 'Viewed customer details',
      'customer:edit': 'Edited customer information',
      'customer:delete': 'Deleted customer account',
      'customer:suspend': 'Suspended customer account',
      'customer:unsuspend': 'Unsuspended customer account',
      'customer:bulk_suspend': 'Bulk suspended customer accounts',
      'customer:bulk_unsuspend': 'Bulk unsuspended customer accounts',
      'customer:bulk_change_plan': 'Bulk changed customer plans',
      'customer:impersonate': 'Logged in as customer',
      'customer:set_password': 'Set customer password',
      'customer:send_reset': 'Sent password reset link to customer',
      'customer:force_reset': 'Forced password reset on next login',
      'payment:view': 'Viewed payment details',
      'payment:refund': 'Issued refund',
      'payment:retry': 'Retried failed payment',
      'subscription:view': 'Viewed subscription details',
      'subscription:upgrade': 'Upgraded subscription',
      'subscription:downgrade': 'Downgraded subscription',
      'subscription:cancel': 'Cancelled subscription',
      'subscription:reactivate': 'Reactivated subscription',
      'subscription:extend_trial': 'Extended trial period',
      'communication:send': 'Sent communication',
      'communication:bulk_send': 'Sent bulk communication',
      'admin:create': 'Created admin user',
      'admin:edit': 'Edited admin user',
      'admin:delete': 'Deleted admin user',
      'admin:login': 'Admin login',
      'admin:logout': 'Admin logout',
      'admin:mfa_setup': 'Setup MFA',
      'coupon:create': 'Created coupon',
      'coupon:update': 'Updated coupon',
      'coupon:enable': 'Enabled coupon',
      'coupon:disable': 'Disabled coupon',
      'system:config_change': 'Changed system configuration',
      'system:export': 'Exported data',
    };
    return descriptions[this.action];
  }

  /**
   * Format changes for display.
   */
  public formatChanges(): string {
    if (this.changes.length === 0) return 'No changes recorded';

    return this.changes
      .map((c) => `${c.field}: "${String(c.oldValue)}" → "${String(c.newValue)}"`)
      .join('\n');
  }
}
