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

  it('delivers via guarded sender with formatted body', async () => {
    const notification = new Notification({
      id: 'n1',
      agentType: AgentType.PARENT,
      studentId: 'stu-1',
      userId: '+15125550100',
      subject: 'Due tomorrow',
      body: 'Math homework',
      priority: NotificationPriority.MEDIUM,
      triggerType: 'deadline',
      channels: [NotificationChannel.SMS],
    });
    const result = await smsDelivery.deliver(notification);
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('SM123');
    expect(mockGuarded.sendTransactional).toHaveBeenCalledWith(
      '+15125550100',
      'Due tomorrow\n\nMath homework',
      expect.objectContaining({ subject: 'Due tomorrow' })
    );
  });
});
