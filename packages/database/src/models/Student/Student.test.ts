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
  });
});
