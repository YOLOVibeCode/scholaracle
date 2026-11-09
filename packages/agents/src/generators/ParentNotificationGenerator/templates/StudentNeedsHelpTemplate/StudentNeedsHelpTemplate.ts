import { Alert } from '@scholaracle/contracts';
import { ITemplateResult, ITemplateAction } from '../../../StudentNotificationGenerator/templates';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** "Tue, Nov 10" or '' when the date is missing or unparseable. */
function shortDue(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Parent copy for a student's "Need help" tap (student review spec §3.2, R3).
 *
 * Subject: "Gideon asked for help with Ch. 5 problems". The body carries the student's
 * note when there is one and a deep link to that student's parent board. Severity is
 * info: this is a conversation starter, not an outage.
 */
export class StudentNeedsHelpTemplate {
  public generate(alert: Alert): ITemplateResult {
    const rd = alert.relatedData as Record<string, unknown>;

    const studentName = text(rd['studentName']);
    const firstName = studentName ? (studentName.split(/\s+/)[0] ?? studentName) : 'Your student';
    const title = text(rd['title']) || text(rd['assignment']) || 'an assignment';
    const course = text(rd['courseName']) || text(rd['course']);
    const note = text(rd['note']);
    const dashboardUrl = text(rd['dashboardUrl']);
    const due = shortDue(rd['dueAt']);

    const subject = `${firstName} asked for help with ${title}`;

    const where = course ? ` in ${course}` : '';
    const when = due ? `, due ${due}` : '';
    const lines = [`${firstName} tapped "Need help" on "${title}"${where}${when}.`];
    if (note) lines.push(`${firstName} wrote: "${note}"`);
    lines.push('Reply with a nudge, or talk it through together.');
    if (dashboardUrl) lines.push(`Open ${firstName}'s board: ${dashboardUrl}`);

    const actions: ITemplateAction[] = dashboardUrl
      ? [{ label: 'Open the board', type: 'link', url: dashboardUrl }]
      : [];

    return { subject, body: lines.join('\n'), actions };
  }
}
