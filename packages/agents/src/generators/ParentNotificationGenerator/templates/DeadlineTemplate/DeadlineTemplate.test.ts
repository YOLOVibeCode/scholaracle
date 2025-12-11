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
      expect(result.subject).toContain('Assignment Due');
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

    it('should include current grade in course', () => {
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
      expect(result.body).toContain('92%');
    });

    it('should include grade weight percentage', () => {
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
      expect(result.body).toContain('5%');
    });

    it('should include action recommendation', () => {
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
      expect(result.body).toContain('Action:');
      expect(result.body).toContain('Ensure');
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
