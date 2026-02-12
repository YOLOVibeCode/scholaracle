import { AdminUser, ROLE_PERMISSIONS } from './AdminUser';
import type { ObjectId } from 'mongodb';

describe('AdminUser', () => {
  describe('constructor', () => {
    it('should create admin user with required fields', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.email).toBe('admin@example.com');
      expect(user.passwordHash).toBe('hashed-password-123');
      expect(user.name).toBe('Test Admin');
      expect(user.role).toBe('admin');
    });

    it('should set isActive to true by default', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.isActive).toBe(true);
    });

    it('should set mfaEnabled to false by default', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.mfaEnabled).toBe(false);
    });

    it('should set default permissions from role when not provided', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'support' as const,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.permissions).toEqual(ROLE_PERMISSIONS['support']);
    });

    it('should set createdAt to current date by default', () => {
      // Arrange
      const before = new Date();
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      // Act
      const user = new AdminUser(data);
      const after = new Date();

      // Assert
      expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(user.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date by default', () => {
      // Arrange
      const before = new Date();
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      // Act
      const user = new AdminUser(data);
      const after = new Date();

      // Assert
      expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(user.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        createdAt,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.createdAt).toEqual(createdAt);
    });

    it('should use provided updatedAt', () => {
      // Arrange
      const updatedAt = new Date('2024-06-15');
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        updatedAt,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.updatedAt).toEqual(updatedAt);
    });

    it('should use provided isActive value', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        isActive: false,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.isActive).toBe(false);
    });

    it('should use provided mfaEnabled value', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        mfaEnabled: true,
        mfaSecret: 'secret-key-abc',
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.mfaEnabled).toBe(true);
      expect(user.mfaSecret).toBe('secret-key-abc');
    });

    it('should use provided optional fields', () => {
      // Arrange
      const lastLogin = new Date('2024-03-01');
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
        lastLogin,
        createdBy: 'super-admin-456',
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.lastLogin).toEqual(lastLogin);
      expect(user.createdBy).toBe('super-admin-456');
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'admin-user-123' } as unknown as ObjectId;
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      // Act
      const user = new AdminUser(data, mockId);

      // Assert
      expect(user._id).toBe(mockId);
    });

    it('should leave _id undefined when not provided', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user._id).toBeUndefined();
    });
  });

  describe('ROLE_PERMISSIONS', () => {
    it('should grant super_admin all permissions', () => {
      // Assert
      expect(ROLE_PERMISSIONS['super_admin']).toEqual([
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

    it('should grant admin standard management permissions', () => {
      // Assert
      expect(ROLE_PERMISSIONS['admin']).toEqual([
        'customers:view',
        'customers:edit',
        'payments:view',
        'subscriptions:view',
        'subscriptions:modify',
        'communications:view',
        'communications:send',
        'analytics:view',
      ]);
    });

    it('should grant support limited customer and communication permissions', () => {
      // Assert
      expect(ROLE_PERMISSIONS['support']).toEqual([
        'customers:view',
        'communications:view',
        'communications:send',
      ]);
    });

    it('should grant billing financial and subscription permissions', () => {
      // Assert
      expect(ROLE_PERMISSIONS['billing']).toEqual([
        'customers:view',
        'payments:view',
        'payments:refund',
        'subscriptions:view',
        'subscriptions:modify',
        'analytics:view',
      ]);
    });

    it('should grant analyst read-only view permissions', () => {
      // Assert
      expect(ROLE_PERMISSIONS['analyst']).toEqual([
        'customers:view',
        'payments:view',
        'subscriptions:view',
        'analytics:view',
      ]);
    });

    it('should not grant admin destructive permissions', () => {
      // Assert
      expect(ROLE_PERMISSIONS['admin']).not.toContain('customers:delete');
      expect(ROLE_PERMISSIONS['admin']).not.toContain('customers:impersonate');
      expect(ROLE_PERMISSIONS['admin']).not.toContain('payments:refund');
      expect(ROLE_PERMISSIONS['admin']).not.toContain('system:config');
      expect(ROLE_PERMISSIONS['admin']).not.toContain('admin:manage');
    });

    it('should not grant analyst write permissions', () => {
      // Assert
      expect(ROLE_PERMISSIONS['analyst']).not.toContain('customers:edit');
      expect(ROLE_PERMISSIONS['analyst']).not.toContain('customers:delete');
      expect(ROLE_PERMISSIONS['analyst']).not.toContain('payments:refund');
      expect(ROLE_PERMISSIONS['analyst']).not.toContain('subscriptions:modify');
      expect(ROLE_PERMISSIONS['analyst']).not.toContain('communications:send');
    });
  });

  describe('hasPermission', () => {
    it('should return true when admin has the permission', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'super_admin' as const,
      };
      const user = new AdminUser(data);

      // Act
      const result = user.hasPermission('admin:manage');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when admin does not have the permission', () => {
      // Arrange
      const data = {
        email: 'analyst@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Analyst',
        role: 'analyst' as const,
      };
      const user = new AdminUser(data);

      // Act
      const result = user.hasPermission('admin:manage');

      // Assert
      expect(result).toBe(false);
    });

    it('should check against role default permissions', () => {
      // Arrange
      const data = {
        email: 'support@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Support',
        role: 'support' as const,
      };
      const user = new AdminUser(data);

      // Act & Assert
      expect(user.hasPermission('customers:view')).toBe(true);
      expect(user.hasPermission('communications:view')).toBe(true);
      expect(user.hasPermission('communications:send')).toBe(true);
      expect(user.hasPermission('payments:view')).toBe(false);
      expect(user.hasPermission('customers:edit')).toBe(false);
    });

    it('should check against custom permissions when provided', () => {
      // Arrange
      const data = {
        email: 'custom@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Custom Permissions User',
        role: 'support' as const,
        permissions: ['customers:view', 'payments:view'] as const,
      };
      const user = new AdminUser(data);

      // Act & Assert
      expect(user.hasPermission('customers:view')).toBe(true);
      expect(user.hasPermission('payments:view')).toBe(true);
      expect(user.hasPermission('communications:send')).toBe(false);
    });
  });

  describe('can', () => {
    it('should return true when admin can perform the action on the resource', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'admin' as const,
      };
      const user = new AdminUser(data);

      // Act
      const result = user.can('customers', 'view');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when admin cannot perform the action on the resource', () => {
      // Arrange
      const data = {
        email: 'analyst@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Analyst',
        role: 'analyst' as const,
      };
      const user = new AdminUser(data);

      // Act
      const result = user.can('customers', 'delete');

      // Assert
      expect(result).toBe(false);
    });

    it('should compose resource and action into permission string', () => {
      // Arrange
      const data = {
        email: 'billing@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Billing',
        role: 'billing' as const,
      };
      const user = new AdminUser(data);

      // Act & Assert
      expect(user.can('payments', 'view')).toBe(true);
      expect(user.can('payments', 'refund')).toBe(true);
      expect(user.can('subscriptions', 'view')).toBe(true);
      expect(user.can('subscriptions', 'modify')).toBe(true);
      expect(user.can('communications', 'send')).toBe(false);
      expect(user.can('admin', 'manage')).toBe(false);
    });

    it('should return false for non-existent resource/action combinations', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Test Admin',
        role: 'super_admin' as const,
      };
      const user = new AdminUser(data);

      // Act
      const result = user.can('nonexistent', 'action');

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getRoleLevel', () => {
    it('should return 100 for super_admin', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Super Admin',
        role: 'super_admin' as const,
      };
      const user = new AdminUser(data);

      // Act
      const level = user.getRoleLevel();

      // Assert
      expect(level).toBe(100);
    });

    it('should return 80 for admin', () => {
      // Arrange
      const data = {
        email: 'admin@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Admin',
        role: 'admin' as const,
      };
      const user = new AdminUser(data);

      // Act
      const level = user.getRoleLevel();

      // Assert
      expect(level).toBe(80);
    });

    it('should return 60 for support', () => {
      // Arrange
      const data = {
        email: 'support@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Support',
        role: 'support' as const,
      };
      const user = new AdminUser(data);

      // Act
      const level = user.getRoleLevel();

      // Assert
      expect(level).toBe(60);
    });

    it('should return 50 for billing', () => {
      // Arrange
      const data = {
        email: 'billing@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Billing',
        role: 'billing' as const,
      };
      const user = new AdminUser(data);

      // Act
      const level = user.getRoleLevel();

      // Assert
      expect(level).toBe(50);
    });

    it('should return 40 for analyst', () => {
      // Arrange
      const data = {
        email: 'analyst@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Analyst',
        role: 'analyst' as const,
      };
      const user = new AdminUser(data);

      // Act
      const level = user.getRoleLevel();

      // Assert
      expect(level).toBe(40);
    });

    it('should reflect role hierarchy where super_admin > admin > support > billing > analyst', () => {
      // Arrange
      const roles = ['super_admin', 'admin', 'support', 'billing', 'analyst'] as const;
      const users = roles.map(
        (role) =>
          new AdminUser({
            email: `${role}@example.com`,
            passwordHash: 'hashed-password-123',
            name: role,
            role,
          })
      );

      // Act
      const levels = users.map((u) => u.getRoleLevel());

      // Assert
      for (let i = 0; i < levels.length - 1; i++) {
        expect(levels[i]!).toBeGreaterThan(levels[i + 1]!);
      }
    });
  });

  describe('custom permissions override', () => {
    it('should use custom permissions instead of role defaults', () => {
      // Arrange
      const customPermissions = ['customers:view', 'analytics:view'] as const;
      const data = {
        email: 'custom@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Custom Admin',
        role: 'super_admin' as const,
        permissions: customPermissions,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.permissions).toEqual(customPermissions);
      expect(user.permissions).not.toEqual(ROLE_PERMISSIONS['super_admin']);
    });

    it('should restrict super_admin when custom permissions are provided', () => {
      // Arrange
      const data = {
        email: 'restricted@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Restricted Super Admin',
        role: 'super_admin' as const,
        permissions: ['customers:view'] as const,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.hasPermission('customers:view')).toBe(true);
      expect(user.hasPermission('admin:manage')).toBe(false);
      expect(user.hasPermission('system:config')).toBe(false);
    });

    it('should expand support role when custom permissions are provided', () => {
      // Arrange
      const data = {
        email: 'expanded-support@example.com',
        passwordHash: 'hashed-password-123',
        name: 'Expanded Support',
        role: 'support' as const,
        permissions: [
          'customers:view',
          'customers:edit',
          'communications:view',
          'communications:send',
          'payments:view',
        ] as const,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.hasPermission('customers:edit')).toBe(true);
      expect(user.hasPermission('payments:view')).toBe(true);
      expect(user.can('customers', 'edit')).toBe(true);
      expect(user.can('payments', 'view')).toBe(true);
    });

    it('should allow empty custom permissions array', () => {
      // Arrange
      const data = {
        email: 'noperm@example.com',
        passwordHash: 'hashed-password-123',
        name: 'No Permissions Admin',
        role: 'admin' as const,
        permissions: [] as const,
      };

      // Act
      const user = new AdminUser(data);

      // Assert
      expect(user.permissions).toEqual([]);
      expect(user.hasPermission('customers:view')).toBe(false);
      expect(user.can('customers', 'view')).toBe(false);
    });
  });
});
