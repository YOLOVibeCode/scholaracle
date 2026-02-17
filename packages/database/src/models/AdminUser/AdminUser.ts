import type { ObjectId } from 'mongodb';

/**
 * Admin role. All admins have full access to the admin portal.
 */
export type AdminRole = 'admin';

/**
 * Admin permission types.
 */
export type AdminPermission =
  | 'customers:view'
  | 'customers:edit'
  | 'customers:delete'
  | 'customers:impersonate'
  | 'payments:view'
  | 'payments:refund'
  | 'subscriptions:view'
  | 'subscriptions:modify'
  | 'communications:view'
  | 'communications:send'
  | 'analytics:view'
  | 'system:config'
  | 'admin:manage';

/**
 * Default permissions by role. All admins have full permissions.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  admin: [
    'customers:view',
    'customers:edit',
    'customers:delete',
    'customers:impersonate',
    'payments:view',
    'payments:refund',
    'subscriptions:view',
    'subscriptions:modify',
    'communications:view',
    'communications:send',
    'analytics:view',
    'system:config',
    'admin:manage',
  ],
} as const;

/**
 * Admin user data interface.
 */
export interface IAdminUserData {
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string;
  readonly role: AdminRole;
  readonly permissions?: readonly AdminPermission[];
  readonly isActive?: boolean;
  readonly lastLogin?: Date;
  readonly mfaEnabled?: boolean;
  readonly mfaSecret?: string;
  readonly createdBy?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  /** Failed login count; reset on success. Used for lockout. */
  readonly failedLoginAttempts?: number;
  /** When lockout ends (e.g. after 5 failures). */
  readonly lockedUntil?: Date;
}

/**
 * Admin user model for platform administration.
 */
export class AdminUser {
  public readonly _id?: ObjectId;
  public readonly email: string;
  public readonly passwordHash: string;
  public readonly name: string;
  public readonly role: AdminRole;
  public readonly permissions: readonly AdminPermission[];
  public readonly isActive: boolean;
  public readonly lastLogin?: Date;
  public readonly mfaEnabled: boolean;
  public readonly mfaSecret?: string;
  public readonly createdBy?: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly failedLoginAttempts: number;
  public readonly lockedUntil?: Date;

  constructor(data: IAdminUserData, id?: ObjectId) {
    this._id = id;
    this.email = data.email;
    this.passwordHash = data.passwordHash;
    this.name = data.name;
    this.role = data.role;
    this.permissions = data.permissions ?? ROLE_PERMISSIONS[data.role];
    this.isActive = data.isActive ?? true;
    this.lastLogin = data.lastLogin;
    this.mfaEnabled = data.mfaEnabled ?? false;
    this.mfaSecret = data.mfaSecret;
    this.createdBy = data.createdBy;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
    this.failedLoginAttempts = data.failedLoginAttempts ?? 0;
    this.lockedUntil = data.lockedUntil;
  }

  /**
   * Check if admin has a specific permission.
   *
   * @param permission - Permission to check
   * @returns True if admin has permission
   */
  public hasPermission(permission: AdminPermission): boolean {
    return this.permissions.includes(permission);
  }

  /**
   * Check if admin can perform an action on a resource.
   *
   * @param resource - Resource type (customers, payments, etc.)
   * @param action - Action type (view, edit, delete, etc.)
   * @returns True if admin can perform action
   */
  public can(resource: string, action: string): boolean {
    const permission = `${resource}:${action}` as AdminPermission;
    return this.hasPermission(permission);
  }

  /**
   * Get role level for comparison. All admins have the same level.
   *
   * @returns Numeric role level
   */
  public getRoleLevel(): number {
    return 100;
  }
}
