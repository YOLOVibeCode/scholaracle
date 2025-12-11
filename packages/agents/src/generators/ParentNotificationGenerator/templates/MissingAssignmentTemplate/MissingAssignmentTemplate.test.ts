import { MissingAssignmentTemplate } from './MissingAssignmentTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';
import { ITemplateAction } from '../../../StudentNotificationGenerator/templates';

describe('MissingAssignmentTemplate (Parent)', () => {
  let template: MissingAssignmentTemplate;

  beforeEach(() => {
    template = new MissingAssignmentTemplate();
  });

  describe('generate', () => {
    it('should generate correct subject with student name', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          gradeImpact: 5,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('MISSING ASSIGNMENT');
      expect(result.subject).toContain('John Doe');
    });

    it('should include student name in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          gradeImpact: 5,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('John Doe');
    });

    it('should include course and assignment details', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'Jane Smith',
          course: 'Science',
          assignment: 'Lab Report',
          daysAgo: 3,
          points: 50,
          gradeImpact: 10,
          currentGrade: 88,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Science');
      expect(result.body).toContain('Lab Report');
    });

    it('should include grade impact analysis', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          gradeImpact: 5,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('92%');
      expect(result.body).toContain('5%');
    });

    it('should include action recommendations', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          gradeImpact: 5,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Action:');
      expect(result.body).toContain('Ensure');
    });

    it('should include assignment URL in actions when provided', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          gradeImpact: 5,
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

    it('should include days ago information', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'John Doe',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 5,
          points: 25,
          gradeImpact: 5,
          currentGrade: 92,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('5 days ago');
    });
  });
});
