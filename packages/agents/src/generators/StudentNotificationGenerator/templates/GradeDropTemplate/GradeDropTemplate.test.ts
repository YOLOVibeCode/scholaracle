import { GradeDropTemplate } from './GradeDropTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('GradeDropTemplate', () => {
  let template: GradeDropTemplate;

  beforeEach(() => {
    template = new GradeDropTemplate();
  });

  describe('generate', () => {
    it('should generate correct subject', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          reason: 'Recent quiz: 70%',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('Grade Drop');
    });

    it('should include course name in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          reason: 'Recent quiz: 70%',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Math');
    });

    it('should show grade drop in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          reason: 'Recent quiz: 70%',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('92%');
      expect(result.body).toContain('85%');
    });

    it('should include reason in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Science',
          previousGrade: 88,
          currentGrade: 82,
          reason: 'Recent quiz: 70%',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Recent quiz: 70%');
    });

    it('should include action instruction', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          previousGrade: 92,
          currentGrade: 85,
          reason: 'Recent quiz: 70%',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Review');
    });
  });
});
