import { Alert, AlertType } from '@scholaracle/contracts';
import { StudentNeedsHelpTemplate } from './StudentNeedsHelpTemplate';

const BOARD =
  'https://scholarmancy.com/dashboard/students/abc123?board=needs_attention#action-board';

function alertWith(relatedData: Record<string, unknown>): Alert {
  return new Alert({
    type: AlertType.STUDENT_NEEDS_HELP,
    studentId: 'abc123',
    severity: 'info',
    relatedData,
  });
}

describe('StudentNeedsHelpTemplate (Parent)', () => {
  const template = new StudentNeedsHelpTemplate();

  it('subject is "<first name> asked for help with <title>"', () => {
    const result = template.generate(
      alertWith({ studentName: 'Gideon Vega', title: 'Ch. 5 problems', courseName: 'Math' })
    );
    expect(result.subject).toBe('Gideon asked for help with Ch. 5 problems');
  });

  it('body names the assignment and course, quotes the note, and links the parent board', () => {
    const result = template.generate(
      alertWith({
        studentName: 'Gideon Vega',
        title: 'Ch. 5 problems',
        courseName: 'Math',
        dueAt: '2026-11-10T22:00:00.000Z',
        note: "I don't get #7",
        dashboardUrl: BOARD,
      })
    );
    expect(result.body).toContain('Gideon tapped "Need help" on "Ch. 5 problems" in Math');
    expect(result.body).toContain('due ');
    expect(result.body).toContain('Gideon wrote: "I don\'t get #7"');
    expect(result.body).toContain(`Open Gideon's board: ${BOARD}`);
    expect(result.actions).toEqual([{ label: 'Open the board', type: 'link', url: BOARD }]);
  });

  it('omits the note line and the link when they are absent; never invents a due date', () => {
    const result = template.generate(
      alertWith({ studentName: 'Gideon', title: 'Lab report', course: 'Science', dueAt: 'nope' })
    );
    expect(result.body).toBe(
      'Gideon tapped "Need help" on "Lab report" in Science.\nReply with a nudge, or talk it through together.'
    );
    expect(result.body).not.toContain('wrote:');
    expect(result.actions).toEqual([]);
  });

  it('falls back to neutral copy when relatedData is empty', () => {
    const result = template.generate(alertWith({}));
    expect(result.subject).toBe('Your student asked for help with an assignment');
    expect(result.body).toContain('Your student tapped "Need help" on "an assignment".');
  });
});
