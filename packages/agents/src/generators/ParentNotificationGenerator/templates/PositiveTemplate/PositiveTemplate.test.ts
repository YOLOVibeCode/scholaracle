import { PositiveTemplate } from './PositiveTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('PositiveTemplate (Parent)', () => {
  let template: PositiveTemplate;

  beforeEach(() => {
    template = new PositiveTemplate();
  });

  describe('generate', () => {
    it('should generate subject with student name', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          studentName: 'John Doe',
          achievement: 'Great work on recent assignments',
          course: 'Math',
          currentGrade: 95,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('John Doe');
    });

    it('should include student name and achievement', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          studentName: 'John Doe',
          achievement: 'Excellent test score',
          course: 'Science',
          currentGrade: 98,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('John Doe');
      expect(result.body).toContain('Excellent test score');
    });

    it('should include current grade when provided', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          studentName: 'John Doe',
          achievement: 'Great work on recent assignments',
          course: 'Math',
          currentGrade: 95,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('95%');
    });
  });
});
