import { Alert, AlertType } from '@scholaracle/contracts';
import { StudentNeedsHelpTemplate } from './StudentNeedsHelpTemplate';

const BOARD =
  'https://scholarmancy.com/dashboard/students/abc123?board=needs_attention#action-board';
/** 11:59 PM Central on Tue Nov 10, 2026 (CST, UTC-6) is 05:59Z on Wed Nov 11. */
const CENTRAL_END_OF_DAY = '2026-11-11T05:59:00.000Z';

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
        dueAt: CENTRAL_END_OF_DAY,
        timeZone: 'America/Chicago',
        note: "I don't get #7",
        dashboardUrl: BOARD,
      })
    );
    expect(result.body).toContain(
      'Gideon tapped "Need help" on "Ch. 5 problems" in Math, due Tue, Nov 10.'
    );
    expect(result.body).toContain('Gideon wrote: "I don\'t get #7"');
    expect(result.body).toContain(`Open Gideon's board: ${BOARD}`);
    expect(result.actions).toEqual([{ label: 'Open the board', type: 'link', url: BOARD }]);
  });

  it('renders the due date in the owner time zone, never the server one', () => {
    const central = template.generate(
      alertWith({ title: 'Lab', dueAt: CENTRAL_END_OF_DAY, timeZone: 'America/Chicago' })
    );
    expect(central.body).toContain('due Tue, Nov 10.');

    const tokyo = template.generate(
      alertWith({ title: 'Lab', dueAt: CENTRAL_END_OF_DAY, timeZone: 'Asia/Tokyo' })
    );
    expect(tokyo.body).toContain('due Wed, Nov 11.');

    const noZone = template.generate(alertWith({ title: 'Lab', dueAt: CENTRAL_END_OF_DAY }));
    expect(noZone.body).toContain('due Wed, Nov 11.');

    const badZone = template.generate(
      alertWith({ title: 'Lab', dueAt: CENTRAL_END_OF_DAY, timeZone: 'Mars/Olympus' })
    );
    expect(badZone.body).toContain('due Wed, Nov 11.');
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
