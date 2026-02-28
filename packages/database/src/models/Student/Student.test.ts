import { Student } from './Student';
import type { ObjectId } from 'mongodb';

describe('Student', () => {
  describe('constructor', () => {
    it('should create student with required fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.userId).toBe('user-123');
      expect(student.name).toBe('Jane Doe');
    });

    it('should set optional fields when provided', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
        grade: 10,
        studentId: 'STU-456',
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.grade).toBe(10);
      expect(student.studentId).toBe('STU-456');
    });

    it('should leave optional fields undefined when not provided', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.grade).toBeUndefined();
      expect(student.studentId).toBeUndefined();
      expect(student.stats).toBeUndefined();
    });

    it('should set dataSources to empty array by default', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.dataSources).toEqual([]);
    });

    it('should set createdAt to current date by default', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
      };

      // Act
      const student = new Student(data);
      const after = new Date();

      // Assert
      expect(student.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(student.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date by default', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
      };

      // Act
      const student = new Student(data);
      const after = new Date();

      // Assert
      expect(student.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(student.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided dataSources', () => {
      // Arrange
      const dataSources = [
        {
          id: 'ds-1',
          pluginId: 'canvas',
          enabled: true,
        },
        {
          id: 'ds-2',
          pluginId: 'powerschool',
          enabled: false,
        },
      ];
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
        dataSources,
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.dataSources).toEqual(dataSources);
      expect(student.dataSources).toHaveLength(2);
    });

    it('should use provided stats', () => {
      // Arrange
      const stats = {
        currentGPA: 3.8,
        totalAssignments: 42,
        missingAssignments: 2,
        onTimeRate: 0.95,
        lastUpdated: new Date('2024-06-15'),
      };
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
        stats,
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.stats).toEqual(stats);
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
        createdAt,
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.createdAt).toEqual(createdAt);
    });

    it('should use provided updatedAt', () => {
      // Arrange
      const updatedAt = new Date('2024-06-01');
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
        updatedAt,
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.updatedAt).toEqual(updatedAt);
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'student-obj-123' } as unknown as ObjectId;
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
      };

      // Act
      const student = new Student(data, mockId);

      // Assert
      expect(student._id).toBe(mockId);
    });

    it('should accept ObjectId for userId', () => {
      // Arrange
      const mockUserId = { toString: () => 'user-obj-456' } as unknown as ObjectId;
      const data = {
        userId: mockUserId,
        name: 'Jane Doe',
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student.userId).toBe(mockUserId);
    });

    it('should leave _id undefined when not provided', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
      };

      // Act
      const student = new Student(data);

      // Assert
      expect(student._id).toBeUndefined();
    });

    it('should set ownerAlertPrefs when provided', () => {
      const data = {
        userId: 'user-123',
        name: 'Jane Doe',
        ownerAlertPrefs: { receiveAlerts: true, alertChannels: ['email', 'sms'] as const },
      };
      const student = new Student(data);
      expect(student.ownerAlertPrefs).toEqual({
        receiveAlerts: true,
        alertChannels: ['email', 'sms'],
      });
    });
  });

  describe('hasContact', () => {
    it('should return true when a contact with the email exists', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [
          { email: 'other@example.com', role: 'parent', status: 'accepted', invitedAt: new Date() },
        ],
      });
      expect(student.hasContact('other@example.com')).toBe(true);
    });

    it('should be case-insensitive', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [
          { email: 'Other@Example.com', role: 'parent', status: 'pending', invitedAt: new Date() },
        ],
      });
      expect(student.hasContact('other@example.com')).toBe(true);
      expect(student.hasContact('OTHER@EXAMPLE.COM')).toBe(true);
    });

    it('should return false when no contact has the email', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [
          { email: 'a@example.com', role: 'parent', status: 'accepted', invitedAt: new Date() },
        ],
      });
      expect(student.hasContact('b@example.com')).toBe(false);
    });

    it('should return false when sharedWith is empty', () => {
      const student = new Student({ userId: 'user-123', name: 'Jane Doe' });
      expect(student.hasContact('any@example.com')).toBe(false);
    });
  });

  describe('getAllAlertRecipients', () => {
    it('should return owner when ownerAlertPrefs is absent (default opted in)', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [],
      });
      const out = student.getAllAlertRecipients('owner@example.com', '+15551234567');
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        email: 'owner@example.com',
        phone: '+15551234567',
        channels: ['email'],
        isPrimary: true,
      });
    });

    it('should exclude owner when ownerAlertPrefs.receiveAlerts is false', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [],
        ownerAlertPrefs: { receiveAlerts: false, alertChannels: ['email'] },
      });
      const out = student.getAllAlertRecipients('owner@example.com');
      expect(out).toHaveLength(0);
    });

    it('should include accepted contacts with receiveAlerts not false', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [
          {
            email: 'contact@example.com',
            name: 'Contact',
            role: 'parent',
            status: 'accepted',
            invitedAt: new Date(),
            acceptedAt: new Date(),
            receiveAlerts: true,
            alertChannels: ['email', 'sms'],
            phone: '+15559876543',
          },
        ],
      });
      const out = student.getAllAlertRecipients('owner@example.com');
      expect(out).toHaveLength(2);
      expect(out[0]).toMatchObject({ email: 'owner@example.com', isPrimary: true });
      expect(out[1]).toMatchObject({
        email: 'contact@example.com',
        phone: '+15559876543',
        name: 'Contact',
        channels: ['email', 'sms'],
        isPrimary: false,
      });
    });

    it('should exclude pending and declined contacts', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [
          {
            email: 'pending@example.com',
            role: 'parent',
            status: 'pending',
            invitedAt: new Date(),
          },
          {
            email: 'declined@example.com',
            role: 'parent',
            status: 'declined',
            invitedAt: new Date(),
          },
        ],
      });
      const out = student.getAllAlertRecipients('owner@example.com');
      expect(out).toHaveLength(1);
      expect(out[0]!.email).toBe('owner@example.com');
    });

    it('should exclude accepted contact with receiveAlerts false', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [
          {
            email: 'optedout@example.com',
            role: 'parent',
            status: 'accepted',
            invitedAt: new Date(),
            acceptedAt: new Date(),
            receiveAlerts: false,
          },
        ],
      });
      const out = student.getAllAlertRecipients('owner@example.com');
      expect(out).toHaveLength(1);
      expect(out[0]!.email).toBe('owner@example.com');
    });

    it('should use ownerAlertPrefs.alertChannels for owner', () => {
      const student = new Student({
        userId: 'user-123',
        name: 'Jane Doe',
        sharedWith: [],
        ownerAlertPrefs: { receiveAlerts: true, alertChannels: ['email', 'sms'] },
      });
      const out = student.getAllAlertRecipients('owner@example.com', '+15550001111');
      expect(out[0]!.channels).toEqual(['email', 'sms']);
    });
  });
});
