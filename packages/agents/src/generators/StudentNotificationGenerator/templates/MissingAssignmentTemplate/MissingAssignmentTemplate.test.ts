import { MissingAssignmentTemplate } from './MissingAssignmentTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('MissingAssignmentTemplate', () => {
  let template: MissingAssignmentTemplate;

  beforeEach(() => {
    template = new MissingAssignmentTemplate();
  });

  describe('generate', () => {
    it('should generate correct subject', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toBe('MISSING ASSIGNMENT');
    });

    it('should include course name in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Math');
      expect(result.body).toContain('Homework 5');
    });

    it('should include days ago in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Science',
          assignment: 'Lab Report',
          daysAgo: 5,
          points: 50,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('5 days ago');
    });

    it('should use concise link-first body with dashboard CTA', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert (concise body; detail in dashboard)
      expect(result.body).toMatch(/Math.*Homework 5/);
      expect(result.body).toMatch(/2 days ago/);
      expect(result.body).toContain('View details in your dashboard');
    });

    it('should include action button when assignmentUrl is provided', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
          assignmentUrl: 'https://canvas.example.com/assignments/123',
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0]?.label).toBe('Submit Now');
      expect(result.actions[0]?.url).toBe('https://canvas.example.com/assignments/123');
    });

    it('should not include action button when assignmentUrl is not provided', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.actions).toHaveLength(0);
    });

    it('should handle singular day correctly', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 1,
          points: 25,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('1 days ago');
    });
  });
});
