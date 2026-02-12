import { AuditLog } from './AuditLog';
import type { ObjectId } from 'mongodb';

describe('AuditLog', () => {
  describe('constructor', () => {
    it('should create audit log with required fields', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.adminUserId).toBe('admin-123');
      expect(log.adminEmail).toBe('admin@example.com');
      expect(log.action).toBe('customer:view');
      expect(log.entityType).toBe('customer');
      expect(log.ipAddress).toBe('192.168.1.1');
      expect(log.userAgent).toBe('Mozilla/5.0');
    });

    it('should auto-determine severity as info for view actions', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.severity).toBe('info');
    });

    it('should auto-determine severity as critical for critical actions', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:delete' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.severity).toBe('critical');
    });

    it('should auto-determine severity as warning for warning actions', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:suspend' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.severity).toBe('warning');
    });

    it('should use provided severity instead of auto-determined', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        severity: 'critical' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.severity).toBe('critical');
    });

    it('should set changes to empty array by default', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.changes).toEqual([]);
    });

    it('should set metadata to empty object by default', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.metadata).toEqual({});
    });

    it('should set timestamp to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);
      const after = new Date();

      // Assert
      expect(log.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(log.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided changes', () => {
      // Arrange
      const changes = [
        { field: 'name', oldValue: 'Old Name', newValue: 'New Name' },
        { field: 'email', oldValue: 'old@test.com', newValue: 'new@test.com' },
      ];
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:edit' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        changes,
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.changes).toEqual(changes);
    });

    it('should use provided optional fields', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:edit' as const,
        entityType: 'customer',
        entityId: 'cust-789',
        entityDescription: 'John Doe account',
        reason: 'Customer requested name change',
        metadata: { source: 'support_ticket', ticketId: 'TK-001' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        sessionId: 'sess-abc',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.entityId).toBe('cust-789');
      expect(log.entityDescription).toBe('John Doe account');
      expect(log.reason).toBe('Customer requested name change');
      expect(log.metadata).toEqual({ source: 'support_ticket', ticketId: 'TK-001' });
      expect(log.sessionId).toBe('sess-abc');
    });

    it('should use provided timestamp', () => {
      // Arrange
      const timestamp = new Date('2024-01-01');
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        timestamp,
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.timestamp).toEqual(timestamp);
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'log-123' } as unknown as ObjectId;
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data, mockId);

      // Assert
      expect(log._id).toBe(mockId);
    });
  });

  describe('getActionDescription', () => {
    it('should return correct description for customer:view', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.getActionDescription()).toBe('Viewed customer details');
    });

    it('should return correct description for payment:refund', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'payment:refund' as const,
        entityType: 'payment',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.getActionDescription()).toBe('Issued refund');
    });

    it('should return correct description for system:export', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'system:export' as const,
        entityType: 'system',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.getActionDescription()).toBe('Exported data');
    });
  });

  describe('formatChanges', () => {
    it('should return "No changes recorded" when changes is empty', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:view' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.formatChanges()).toBe('No changes recorded');
    });

    it('should format single change correctly', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:edit' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        changes: [{ field: 'name', oldValue: 'Old', newValue: 'New' }],
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.formatChanges()).toBe('name: "Old" → "New"');
    });

    it('should format multiple changes with newlines', () => {
      // Arrange
      const data = {
        adminUserId: 'admin-123',
        adminEmail: 'admin@example.com',
        action: 'customer:edit' as const,
        entityType: 'customer',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        changes: [
          { field: 'name', oldValue: 'Old Name', newValue: 'New Name' },
          { field: 'email', oldValue: 'old@test.com', newValue: 'new@test.com' },
        ],
      };

      // Act
      const log = new AuditLog(data);

      // Assert
      expect(log.formatChanges()).toBe(
        'name: "Old Name" → "New Name"\nemail: "old@test.com" → "new@test.com"'
      );
    });
  });
});
