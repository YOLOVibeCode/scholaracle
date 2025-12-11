import { WorkloadTemplate } from './WorkloadTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('WorkloadTemplate (Parent)', () => {
  let template: WorkloadTemplate;

  beforeEach(() => {
    template = new WorkloadTemplate();
  });

  describe('generate', () => {
    it('should generate subject with student name', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          studentName: 'John Doe',
          assignmentCount: 5,
          isDueThisWeek: true,
          assignments: [
            { course: 'Math', dueDate: '2024-11-20' },
            { course: 'English', dueDate: '2024-11-21' },
          ],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('John Doe');
      expect(result.subject).toContain('Assignments');
    });

    it('should include student name and assignment count', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          studentName: 'John Doe',
          assignmentCount: 5,
          isDueThisWeek: true,
          assignments: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('John Doe');
      expect(result.body).toContain('5');
    });

    it('should include assignment breakdown when provided', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          studentName: 'John Doe',
          assignmentCount: 3,
          isDueThisWeek: true,
          assignments: [
            { course: 'Math', dueDate: '2024-11-20', assignment: 'Homework 5' },
            { course: 'English', dueDate: '2024-11-21', assignment: 'Essay' },
            { course: 'Science', dueDate: '2024-11-22', assignment: 'Lab Report' },
          ],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Math');
      expect(result.body).toContain('English');
      expect(result.body).toContain('Science');
    });

    it('should include monitoring recommendation', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          studentName: 'John Doe',
          assignmentCount: 5,
          isDueThisWeek: true,
          assignments: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Monitor');
    });

    it('should handle when assignments array is undefined', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          studentName: 'John Doe',
          assignmentCount: 3,
          isDueThisWeek: false,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('John Doe');
      expect(result.body).toContain('3');
      expect(result.body).toContain('Upcoming');
    });

    it('should handle when isDueThisWeek is false', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          studentName: 'Jane Smith',
          assignmentCount: 4,
          isDueThisWeek: false,
          assignments: [],
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Upcoming');
      expect(result.subject).toContain('Soon');
    });
  });
});
