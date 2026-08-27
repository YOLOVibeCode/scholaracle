import type { INotificationSink } from '@scholaracle/interfaces';
import type { NotificationService } from '../service/NotificationService';

export interface IReminderSinkDeps {
  readonly notificationService: NotificationService;
  readonly resolveEmail: (
    audience: 'student' | 'parent',
    studentId: string
  ) => Promise<string | null>;
}

/**
 * Delivers ladder copy through the existing reminder channel (email today).
 * Nudge uses audience student only — never call this with parent for a nudge.
 */
export class ReminderNotificationSink implements INotificationSink {
  public constructor(private readonly _deps: IReminderSinkDeps) {}

  public async send(input: {
    readonly audience: 'student' | 'parent';
    readonly studentId: string;
    readonly body: string;
    readonly deepLink: string;
  }): Promise<void> {
    const email = await this._deps.resolveEmail(input.audience, input.studentId);
    if (email === null || email === '') return;
    const subject = input.audience === 'parent' ? 'Scholaracle' : 'A next step';
    await this._deps.notificationService.sendReminder(
      email,
      'email',
      subject,
      `${input.body}\n${input.deepLink}`,
      {
        studentId: input.studentId,
      }
    );
  }
}
