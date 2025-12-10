import { DeadlineTemplate } from './DeadlineTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('DeadlineTemplate', () => {
  let template: DeadlineTemplate;

  beforeEach(() => {
    template = new DeadlineTemplate();
  });

  describe('generate', () => {
    it('should generate correct subject', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('Assignment Due');
    });

    it('should include course and assignment in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Math');
      expect(result.body).toContain('Chapter 5 Homework');
    });

    it('should include due date in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Science',
          assignment: 'Lab Report',
          dueDate: '2024-11-20T23:59:00Z',
          points: 50,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Due:');
    });

    it('should include points value in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('25 points');
    });

    it('should include action instruction', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Complete and submit');
    });

    it('should include action link when assignmentUrl is provided', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
          assignmentUrl: 'https://canvas.example.com/assignments/123',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]?.label).toBe('View Assignment');
      expect(result.actions[0]?.url).toBe('https://canvas.example.com/assignments/123');
    });
  });
});
