import { Alert } from '@scholaracle/contracts';

export interface ITemplateResult {
  readonly subject: string;
  readonly body: string;
  readonly actions: ITemplateAction[];
}

export interface ITemplateAction {
  readonly label: string;
  readonly type: 'link' | 'button';
  readonly url?: string;
  readonly action?: string;
}

/**
 * Template for generating student notifications about missing assignments.
 * Direct, clear messaging telling student what to do.
 */
export class MissingAssignmentTemplate {
  public generate(alert: Alert): ITemplateResult {
    const rd = alert.relatedData as Record<string, unknown>;

    const course = (rd['course'] as string) ?? (rd['courseExternalId'] as string) ?? 'a course';
    const assignment = (rd['assignment'] as string) ?? (rd['title'] as string) ?? 'an assignment';
    const daysAgo =
      typeof rd['daysAgo'] === 'number' ? rd['daysAgo'] : this._calcDaysAgo(rd['dueAt'] as string);

    const overduePart = daysAgo > 0 ? ` — ${daysAgo} day${daysAgo === 1 ? '' : 's'} overdue` : '';
    const body = `${course}: "${assignment}"${overduePart}. Check your portal and submit if possible.`;
    const subject = `Missing: ${assignment} (${course})`;

    const actions: ITemplateAction[] = [];
    if (rd['assignmentUrl']) {
      actions.push({ label: 'Submit Now', type: 'link', url: rd['assignmentUrl'] as string });
    }

    return { subject, body, actions };
  }

  private _calcDaysAgo(dueAt?: string): number {
    if (!dueAt) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(dueAt).getTime()) / 86_400_000));
  }
}
