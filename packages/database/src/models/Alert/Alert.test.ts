import { Alert } from './Alert';
import type { ObjectId } from 'mongodb';

describe('Alert', () => {
  describe('constructor', () => {
    it('should create alert with required fields', () => {
      // Arrange
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Assignment is missing',
      };

      // Act
      const alert = new Alert(data);

      // Assert
      expect(alert.studentId).toBe('student-123');
      expect(alert.userId).toBe('user-123');
      expect(alert.type).toBe('MISSING_ASSIGNMENT');
      expect(alert.severity).toBe('warning');
      expect(alert.message).toBe('Assignment is missing');
    });

    it('should set acknowledged to false by default', () => {
      // Arrange
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
      };

      // Act
      const alert = new Alert(data);

      // Assert
      expect(alert.acknowledged).toBe(false);
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
      };

      // Act
      const alert = new Alert(data);
      const after = new Date();

      // Assert
      expect(alert.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(alert.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided acknowledged value', () => {
      // Arrange
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
        acknowledged: true,
        acknowledgedAt: new Date('2024-01-01'),
      };

      // Act
      const alert = new Alert(data);

      // Assert
      expect(alert.acknowledged).toBe(true);
      expect(alert.acknowledgedAt).toEqual(new Date('2024-01-01'));
    });

    it('should use provided relatedData', () => {
      // Arrange
      const relatedData = {
        assignmentId: 'assign-123',
        courseName: 'Math 101',
      };
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
        relatedData,
      };

      // Act
      const alert = new Alert(data);

      // Assert
      expect(alert.relatedData).toEqual(relatedData);
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
        createdAt,
      };

      // Act
      const alert = new Alert(data);

      // Assert
      expect(alert.createdAt).toEqual(createdAt);
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'alert-123' } as unknown as ObjectId;
      const data = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
      };

      // Act
      const alert = new Alert(data, mockId);

      // Assert
      expect(alert._id).toBe(mockId);
    });
  });
});
