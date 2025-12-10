import { WorkloadTemplate } from './WorkloadTemplate';
import { Alert, AlertType } from '@scholaracle/contracts';

describe('WorkloadTemplate', () => {
  let template: WorkloadTemplate;

  beforeEach(() => {
    template = new WorkloadTemplate();
  });

  describe('generate', () => {
    it('should generate correct subject', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          assignmentCount: 5,
          isDueThisWeek: true,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.subject).toContain('Assignments');
    });

    it('should include assignment count in body', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          assignmentCount: 5,
          isDueThisWeek: true,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('5');
    });

    it('should mention this week when dueThisWeek is true', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          assignmentCount: 3,
          isDueThisWeek: true,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('this week');
    });

    it('should mention upcoming when isDueThisWeek is false', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          assignmentCount: 3,
          isDueThisWeek: false,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('upcoming');
    });

    it('should include planning instruction', () => {
      // Arrange
      const alert = new Alert({
        type: AlertType.WORKLOAD,
        studentId: 'student-123',
        severity: 'medium',
        relatedData: {
          assignmentCount: 5,
          isDueThisWeek: true,
        },
      });

      // Act
      const result = template.generate(alert);

      // Assert
      expect(result.body).toContain('Plan');
    });
  });
});
