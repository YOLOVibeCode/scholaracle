import { ReminderNotificationSink } from './ReminderNotificationSink';
import type { NotificationService } from '../service/NotificationService';

describe('ReminderNotificationSink', () => {
  it('sends student copy only to the resolved student email', async () => {
    const sendReminder = jest.fn().mockResolvedValue({});
    const sink = new ReminderNotificationSink({
      notificationService: { sendReminder } as unknown as NotificationService,
      resolveEmail: async (audience) =>
        audience === 'student' ? 'emma.demo@scholarmancy.com' : 'parent@x.com',
    });
    await sink.send({
      audience: 'student',
      studentId: 'emma-id',
      body: 'Still open — tap to pick it up.',
      deepLink: '/studio/assignments/demo-emma-ap-bio-a5',
    });
    expect(sendReminder).toHaveBeenCalledWith(
      'emma.demo@scholarmancy.com',
      'email',
      'A next step',
      expect.stringContaining('Still open'),
      { studentId: 'emma-id' }
    );
  });

  it('skips when no email is resolved', async () => {
    const sendReminder = jest.fn();
    const sink = new ReminderNotificationSink({
      notificationService: { sendReminder } as unknown as NotificationService,
      resolveEmail: async () => null,
    });
    await sink.send({
      audience: 'parent',
      studentId: 'emma-id',
      body: 'Still missing',
      deepLink: '/dashboard/students/emma-id?board=needs_attention#action-board',
    });
    expect(sendReminder).not.toHaveBeenCalled();
  });
});
