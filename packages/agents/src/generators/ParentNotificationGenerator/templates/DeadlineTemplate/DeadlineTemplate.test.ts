import { DeadlineTemplate } from './DeadlineTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';
import { ITemplateAction } from '../../../StudentNotificationGenerator/templates';

describe('DeadlineTemplate (Parent)', () => {
  let template: DeadlineTemplate;

  beforeEach(() => {
    template = new DeadlineTemplate();
  });

  describe('generate', () => {
    it('should generate subject with student name', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
          gradeWeight: 5,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('John Doe');
      expect(result.subject).toContain('Due ');
    });

    it('should include student name and course details', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'Jane Smith',
          course: 'Science',
          assignment: 'Lab Report',
          dueDate: '2024-11-20T23:59:00Z',
          points: 50,
          gradeWeight: 10,
          currentGrade: 88,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Jane Smith');
      expect(result.body).toContain('Science');
      expect(result.body).toContain('Lab Report');
    });

    it('should use concise link-first body with dashboard CTA', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
          gradeWeight: 5,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert (concise body; detail in dashboard)
      expect(result.body).toContain('John Doe');
      expect(result.body).toContain('Math');
      expect(result.body).toContain('Chapter 5 Homework');
    });

    it('should include action links when provided', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Chapter 5 Homework',
          dueDate: '2024-11-20T23:59:00Z',
          points: 25,
          gradeWeight: 5,
          currentGrade: 92,
          assignmentUrl: 'https://canvas.example.com/assignments/123',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.actions.length).toBeGreaterThan(0);
      expect(result.actions.some((a: ITemplateAction) => a.label.includes('View'))).toBe(true);
    });
  });
});
