import { Alert } from '@scholaracle/contracts';
import type { ITemplateResult } from '../MissingAssignmentTemplate';

/**
 * Student copy for their own "Need help" tap. The audience map never delivers this to the
 * student (student_needs_help is parent-only); it exists so every generator stays exhaustive
 * and so an in-app confirmation ("Your grown-ups were told") can reuse it later.
 */
export class StudentNeedsHelpTemplate {
  public generate(alert: Alert): ITemplateResult {
    const rd = alert.relatedData as Record<string, unknown>;
    const rawTitle = rd['title'] ?? rd['assignment'];
    const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : 'this one';
    return {
      subject: `Your grown-ups were told about ${title}`,
      body: `You asked for help with "${title}". Your grown-ups were told. Moving the status on clears it.`,
      actions: [],
    };
  }
}
