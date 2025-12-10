import { Alert } from './Alert';
import { AlertType } from '../enums/AlertType';

describe('Alert', () => {
  const validData = {
    type: AlertType.MISSING_ASSIGNMENT,
    studentId: 'student-123',
    severity: 'high',
    relatedData: {
      course: 'Math',
      assignment: 'Homework 5',
      points: 25,
    },
  };

  describe('constructor', () => {
    it('should create alert with all required fields', () => {
      // Act
      const alert = new Alert(validData);

      // Assert
      expect(alert.type).toBe(AlertType.MISSING_ASSIGNMENT);
      expect(alert.studentId).toBe('student-123');
      expect(alert.severity).toBe('high');
      expect(alert.relatedData).toEqual({
        course: 'Math',
        assignment: 'Homework 5',
        points: 25,
      });
      expect(alert.id).toBeDefined();
      expect(alert.createdAt).toBeInstanceOf(Date);
    });

    it('should generate unique ID for each alert', () => {
      // Act
      const alert1 = new Alert(validData);
      const alert2 = new Alert(validData);

      // Assert
      expect(alert1.id).not.toBe(alert2.id);
    });

    it('should set createdAt to current time by default', () => {
      // Arrange
      const beforeCreation = new Date();

      // Act
      const alert = new Alert(validData);
      const afterCreation = new Date();

      // Assert
      expect(alert.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(alert.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    });

    it('should use provided createdAt when specified', () => {
      // Arrange
      const customDate = new Date('2024-01-01T00:00:00Z');

      // Act
      const alert = new Alert({
        ...validData,
        createdAt: customDate,
      });

      // Assert
      expect(alert.createdAt).toEqual(customDate);
    });

    it('should throw error when type is missing', () => {
      // Act & Assert
      expect(() => {
        new Alert({
          ...validData,
          type: undefined as unknown as AlertType,
        });
      }).toThrow('Missing required field: type');
    });

    it('should throw error when studentId is missing', () => {
      // Act & Assert
      expect(() => {
        new Alert({
          ...validData,
          studentId: undefined as unknown as string,
        });
      }).toThrow('Missing required field: studentId');
    });

    it('should throw error when severity is missing', () => {
      // Act & Assert
      expect(() => {
        new Alert({
          ...validData,
          severity: undefined as unknown as string,
        });
      }).toThrow('Missing required field: severity');
    });

    it('should throw error when relatedData is missing', () => {
      // Act & Assert
      expect(() => {
        new Alert({
          ...validData,
          relatedData: undefined as unknown as Record<string, unknown>,
        });
      }).toThrow('Missing required field: relatedData');
    });
  });
});
