import { AdminUser, ROLE_PERMISSIONS } from './AdminUser';
import type { ObjectId } from 'mongodb';

describe('AdminUser', () => {
  describe('constructor', () => {
    it('should create admin user with required fields', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      const user = new AdminUser(data);

      expect(user.email).toBe('admin@example.com');
      expect(user.passwordHash).toBe('hashed-password-123');
      expect(user.name).toBe('Test Admin');
      expect(user.role).toBe('admin');
    });

    it('should set isActive to true by default', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      const user = new AdminUser(data);

      expect(user.isActive).toBe(true);
    });

    it('should set mfaEnabled to false by default', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      const user = new AdminUser(data);

      expect(user.mfaEnabled).toBe(false);
    });

    it('should set default permissions from role when not provided', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      const user = new AdminUser(data);

      expect(user.permissions).toEqual(ROLE_PERMISSIONS['admin']);
    });

    it('should set createdAt to current date by default', () => {
      const before = new Date();
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      const user = new AdminUser(data);
      const after = new Date();

      expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date by default', () => {
      const before = new Date();
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      const user = new AdminUser(data);
      const after = new Date();

      expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(user.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided createdAt', () => {
      const createdAt = new Date('2024-01-01');
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        createdAt,
      };

      const user = new AdminUser(data);

      expect(user.createdAt).toEqual(createdAt);
    });

    it('should use provided updatedAt', () => {
      const updatedAt = new Date('2024-06-15');
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        updatedAt,
      };

      const user = new AdminUser(data);

      expect(user.updatedAt).toEqual(updatedAt);
    });

    it('should use provided isActive value', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        isActive: false,
      };

      const user = new AdminUser(data);

      expect(user.isActive).toBe(false);
    });

    it('should use provided mfaEnabled value', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        mfaEnabled: true,
        mfaSecret: 'secret-key-abc',
      };

      const user = new AdminUser(data);

      expect(user.mfaEnabled).toBe(true);
      expect(user.mfaSecret).toBe('secret-key-abc');
    });

    it('should use provided optional fields', () => {
      const lastLogin = new Date('2024-03-01');
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        lastLogin,
        createdBy: 'admin-456',
      };

      const user = new AdminUser(data);

      expect(user.lastLogin).toEqual(lastLogin);
      expect(user.createdBy).toBe('admin-456');
    });

    it('should accept ObjectId for _id', () => {
      const mockId = { toString: () => 'admin-user-123' } as unknown as ObjectId;
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      const user = new AdminUser(data, mockId);

      expect(user._id).toBe(mockId);
    });

    it('should leave _id undefined when not provided', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      const user = new AdminUser(data);

      expect(user._id).toBeUndefined();
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('should grant admin all permissions', () => {
      expect(ROLE_PERMISSIONS['admin']).toEqual([
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
      ]);
    });

    it('should only have the admin role defined', () => {
      expect(Object.keys(ROLE_PERMISSIONS)).toEqual(['admin']);
    });
  });

  describe('hasPermission', () => {
    it('should return true when admin has the permission', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };
      const user = new AdminUser(data);

      const result = user.hasPermission('admin:manage');

      expect(result).toBe(true);
    });

    it('should check against role default permissions', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };
      const user = new AdminUser(data);

      expect(user.hasPermission('customers:view')).toBe(true);
      expect(user.hasPermission('communications:view')).toBe(true);
      expect(user.hasPermission('communications:send')).toBe(true);
      expect(user.hasPermission('payments:view')).toBe(true);
      expect(user.hasPermission('customers:edit')).toBe(true);
      expect(user.hasPermission('admin:manage')).toBe(true);
    });

    it('should check against custom permissions when provided', () => {
      const data = {
        email: 'custom@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Custom Permissions User',
        role: 'admin' as const,
        permissions: ['customers:view', 'payments:view'] as const,
      };
      const user = new AdminUser(data);

      expect(user.hasPermission('customers:view')).toBe(true);
      expect(user.hasPermission('payments:view')).toBe(true);
      expect(user.hasPermission('communications:send')).toBe(false);
    });
  });

  describe('can', () => {
    it('should return true when admin can perform the action on the resource', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };
      const user = new AdminUser(data);

      expect(user.can('customers', 'view')).toBe(true);
      expect(user.can('customers', 'delete')).toBe(true);
      expect(user.can('payments', 'refund')).toBe(true);
      expect(user.can('admin', 'manage')).toBe(true);
    });

    it('should return false for non-existent resource/action combinations', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };
      const user = new AdminUser(data);

      const result = user.can('nonexistent', 'action');

      expect(result).toBe(false);
    });
  });

  describe('getRoleLevel', () => {
    it('should return 100 for admin', () => {
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Admin',
        role: 'admin' as const,
      };
      const user = new AdminUser(data);

      const level = user.getRoleLevel();

      expect(level).toBe(100);
    });
  });

  describe('custom permissions override', () => {
    it('should use custom permissions instead of role defaults', () => {
      const customPermissions = ['customers:view', 'analytics:view'] as const;
      const data = {
        email: 'custom@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Custom Admin',
        role: 'admin' as const,
        permissions: customPermissions,
      };

      const user = new AdminUser(data);

      expect(user.permissions).toEqual(customPermissions);
    });

    it('should restrict admin when custom permissions are provided', () => {
      const data = {
        email: 'restricted@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Restricted Admin',
        role: 'admin' as const,
        permissions: ['customers:view'] as const,
      };

      const user = new AdminUser(data);

      expect(user.hasPermission('customers:view')).toBe(true);
      expect(user.hasPermission('admin:manage')).toBe(false);
      expect(user.hasPermission('system:config')).toBe(false);
    });

    it('should allow empty custom permissions array', () => {
      const data = {
        email: 'noperm@example.com',
        passwordHash: 'hashed-password-123',
        name: 'No Permissions Admin',
        role: 'admin' as const,
        permissions: [] as const,
      };

      const user = new AdminUser(data);

      expect(user.permissions).toEqual([]);
      expect(user.hasPermission('customers:view')).toBe(false);
      expect(user.can('customers', 'view')).toBe(false);
    });
  });
});
