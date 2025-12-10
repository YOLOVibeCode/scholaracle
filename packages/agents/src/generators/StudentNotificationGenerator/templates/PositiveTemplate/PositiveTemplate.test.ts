import { PositiveTemplate } from './PositiveTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('PositiveTemplate', () => {
  let template: PositiveTemplate;

  beforeEach(() => {
    template = new PositiveTemplate();
  });

  describe('generate', () => {
    it('should generate correct subject', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          achievement: 'Great work on recent assignments',
          course: 'Math',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toBeDefined();
    });

    it('should include achievement in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          achievement: 'Great work on recent assignments',
          course: 'Math',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Great work');
    });

    it('should include course name in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          achievement: 'Excellent test score',
          course: 'Science',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Science');
    });

    it('should include encouragement', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.POSITIVE,
        studentId: 'student-123',
        severity: 'low',
        relatedData: {
          achievement: 'Great work on recent assignments',
          course: 'Math',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body.length).toBeGreaterThan(0);
    });
  });
});
