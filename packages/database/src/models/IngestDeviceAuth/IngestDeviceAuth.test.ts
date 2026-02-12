import { IngestDeviceAuth } from './IngestDeviceAuth';
import type { ObjectId } from 'mongodb';

describe('IngestDeviceAuth', () => {
  describe('constructor', () => {
    it('should create ingest device auth with required fields', () => {
      // Arrange
      const expiresAt = new Date('2024-06-01');
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        expiresAt,
      };

      // Act
      const auth = new IngestDeviceAuth(data);

      // Assert
      expect(auth.deviceCode).toBe('dev-code-abc123');
      expect(auth.userCode).toBe('ABCD-1234');
      expect(auth.expiresAt).toEqual(expiresAt);
    });

    it('should set status to pending by default', () => {
      // Arrange
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        expiresAt: new Date('2024-06-01'),
      };

      // Act
      const auth = new IngestDeviceAuth(data);

      // Assert
      expect(auth.status).toBe('pending');
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        expiresAt: new Date('2024-06-01'),
      };

      // Act
      const auth = new IngestDeviceAuth(data);
      const after = new Date();

      // Assert
      expect(auth.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(auth.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided status', () => {
      // Arrange
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        status: 'approved' as const,
        expiresAt: new Date('2024-06-01'),
      };

      // Act
      const auth = new IngestDeviceAuth(data);

      // Assert
      expect(auth.status).toBe('approved');
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        expiresAt: new Date('2024-06-01'),
        createdAt,
      };

      // Act
      const auth = new IngestDeviceAuth(data);

      // Assert
      expect(auth.createdAt).toEqual(createdAt);
    });

    it('should use provided optional fields', () => {
      // Arrange
      const mockUserId = { toString: () => 'user-obj-456' } as unknown as ObjectId;
      const tokenDeliveredAt = new Date('2024-01-15');
      const approvedAt = new Date('2024-01-10');
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        status: 'approved' as const,
        userId: mockUserId,
        connectorToken: 'tok-xyz789',
        tokenDeliveredAt,
        expiresAt: new Date('2024-06-01'),
        approvedAt,
      };

      // Act
      const auth = new IngestDeviceAuth(data);

      // Assert
      expect(auth.userId).toBe(mockUserId);
      expect(auth.connectorToken).toBe('tok-xyz789');
      expect(auth.tokenDeliveredAt).toEqual(tokenDeliveredAt);
      expect(auth.approvedAt).toEqual(approvedAt);
    });

    it('should leave optional fields undefined when not provided', () => {
      // Arrange
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        expiresAt: new Date('2024-06-01'),
      };

      // Act
      const auth = new IngestDeviceAuth(data);

      // Assert
      expect(auth.userId).toBeUndefined();
      expect(auth.connectorToken).toBeUndefined();
      expect(auth.tokenDeliveredAt).toBeUndefined();
      expect(auth.approvedAt).toBeUndefined();
    });

    it('should accept string for userId', () => {
      // Arrange
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        userId: 'user-string-123',
        expiresAt: new Date('2024-06-01'),
      };

      // Act
      const auth = new IngestDeviceAuth(data);

      // Assert
      expect(auth.userId).toBe('user-string-123');
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'auth-123' } as unknown as ObjectId;
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        expiresAt: new Date('2024-06-01'),
      };

      // Act
      const auth = new IngestDeviceAuth(data, mockId);

      // Assert
      expect(auth._id).toBe(mockId);
    });

    it('should support expired status', () => {
      // Arrange
      const data = {
        deviceCode: 'dev-code-abc123',
        userCode: 'ABCD-1234',
        status: 'expired' as const,
        expiresAt: new Date('2024-01-01'),
      };

      // Act
      const auth = new IngestDeviceAuth(data);

      // Assert
      expect(auth.status).toBe('expired');
    });
  });
});
