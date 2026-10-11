import { SMSDelivery } from './SMSDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';
import type { GuardedSmsSender } from '../../sms/GuardedSmsSender';

describe('SMSDelivery', () => {
  let smsDelivery: SMSDelivery;
  let mockGuarded: jest.Mocked<Pick<GuardedSmsSender, 'sendTransactional'>>;

  beforeEach(() => {
    mockGuarded = {
      sendTransactional: jest.fn().mockResolvedValue({ messageId: 'SM123' }),
    };
    smsDelivery = new SMSDelivery(mockGuarded as unknown as GuardedSmsSender);
  });

  it('supports SMS channel only', () => {
    expect(smsDelivery.supports(NotificationChannel.SMS)).toBe(true);
    expect(smsDelivery.supports(NotificationChannel.EMAIL)).toBe(false);
  });

  it('sends the concise one-segment SMS template for the alert, not the email body', async () => {
    const notification = new Notification({
      id: 'n1',
      agentType: AgentType.PARENT,
      studentId: 'stu-1',
      userId: '+15125550100',
      subject: 'Emma - Math Grade Drop: 85% \u2192 72%',
      body: 'GRADE DROP ALERT\n\nStudent: Emma\nCourse: Math ...',
      priority: NotificationPriority.CRITICAL,
      triggerType: 'grade_drop',
      triggerData: {
        studentName: 'Emma Johnson',
        course: 'Math',
        previousGrade: 85,
        currentGrade: 72,
      },
      channels: [NotificationChannel.SMS],
    });
    const result = await smsDelivery.deliver(notification);
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('SM123');
    expect(mockGuarded.sendTransactional).toHaveBeenCalledWith(
      '+15125550100',
      "Scholarmancy: Emma's Math grade dropped from 85% to 72%. Details: https://scholarmancy.com/alerts Reply STOP to opt out.",
      expect.objectContaining({ templateName: 'sms_grade_drop' })
    );
  });

  it('links to the configured web origin', async () => {
    const delivery = new SMSDelivery(mockGuarded as unknown as GuardedSmsSender, {
      webOrigin: 'https://web-dev.example',
    });
    await delivery.deliver(
      new Notification({
        agentType: AgentType.PARENT,
        studentId: 'stu-1',
        userId: '+15125550100',
        subject: 's',
        body: 'b',
        priority: NotificationPriority.CRITICAL,
        triggerType: 'workload',
        triggerData: { studentName: 'Emma', assignmentCount: 3, isDueThisWeek: true },
        channels: [NotificationChannel.SMS],
      })
    );
    expect(mockGuarded.sendTransactional.mock.calls[0]![1]).toContain(
      'Details: https://web-dev.example/alerts'
    );
  });
});
