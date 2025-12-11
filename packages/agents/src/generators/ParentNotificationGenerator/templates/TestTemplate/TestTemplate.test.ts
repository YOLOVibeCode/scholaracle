import { TestTemplate } from './TestTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('TestTemplate (Parent)', () => {
  let template: TestTemplate;

  beforeEach(() => {
    template = new TestTemplate();
  });

  describe('generate', () => {
    it('should generate subject with student name', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('John Doe');
      expect(result.subject).toContain('Test');
    });

    it('should include student name and test details', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('John Doe');
      expect(result.body).toContain('Chapter 5 Exam');
    });

    it('should include current grade and weight', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('92%');
      expect(result.body).toContain('20%');
    });

    it('should include study recommendation', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Monitor');
    });
  });
});
