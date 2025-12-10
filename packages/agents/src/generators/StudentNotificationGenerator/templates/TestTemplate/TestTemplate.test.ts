import { TestTemplate } from './TestTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('TestTemplate', () => {
  let template: TestTemplate;

  beforeEach(() => {
    template = new TestTemplate();
  });

  describe('generate', () => {
    it('should generate correct subject', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('Test');
    });

    it('should include course and test name in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Math');
      expect(result.body).toContain('Chapter 5 Exam');
    });

    it('should include test date in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Science',
          testName: 'Midterm',
          testDate: '2024-11-25T09:00:00Z',
          weight: 30,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Date:');
    });

    it('should include weight in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('20%');
    });

    it('should include study instruction', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.TEST,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          testName: 'Chapter 5 Exam',
          testDate: '2024-11-25T09:00:00Z',
          weight: 20,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Study');
    });
  });
});
