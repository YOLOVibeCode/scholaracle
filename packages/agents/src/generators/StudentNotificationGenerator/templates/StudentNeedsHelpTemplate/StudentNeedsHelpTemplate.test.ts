import { Alert, AlertType } from '@scholaracle/contracts';
import { StudentNeedsHelpTemplate } from './StudentNeedsHelpTemplate';

describe('StudentNeedsHelpTemplate (Student)', () => {
  const template = new StudentNeedsHelpTemplate();

  it('confirms the grown-ups were told, naming the assignment and no grades', () => {
    const result = template.generate(
      new Alert({
        type: AlertType.STUDENT_NEEDS_HELP,
        studentId: 'stu-1',
        severity: 'info',
        relatedData: { title: 'Ch. 5 problems', courseName: 'Math' },
      })
    );
    expect(result.subject).toBe('Your grown-ups were told about Ch. 5 problems');
    expect(result.body).toContain('Your grown-ups were told');
    expect(result.body).not.toMatch(/\d+\s*%/);
    expect(result.actions).toEqual([]);
  });

  it('falls back when the title is missing', () => {
    const result = template.generate(
      new Alert({
        type: AlertType.STUDENT_NEEDS_HELP,
        studentId: 'stu-1',
        severity: 'info',
        relatedData: {},
      })
    );
    expect(result.subject).toBe('Your grown-ups were told about this one');
  });
});
