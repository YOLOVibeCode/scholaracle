/**
 * Tests for DigestSender implementation (TDD — M1).
 * RED phase: tests first, implementation follows.
 */

import type { Db } from 'mongodb';
import type { IEmailDigestPendingItem } from '@scholaracle/database';
import { DigestSender } from './digest-sender';
import type { IDigestInsightService } from './interfaces';
import type { IEmailTransport } from '@scholaracle/agents';

function makeItem(overrides: Partial<IEmailDigestPendingItem>): IEmailDigestPendingItem {
  return {
    userId: 'user-123',
    recipientEmail: 'parent@test.com',
    alertType: 'missing_assignment',
    severity: 'high',
    subject: 'Alert',
    body: 'Alert message',
    studentName: 'Ava',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('DigestSender', () => {
  let mockDb: Db;
  let mockTransport: IEmailTransport;
  let mockDigestRepo: {
    findByUserId: jest.Mock;
    deleteByUserId: jest.Mock;
  };
  let mockCommLogRepo: {
    create: jest.Mock;
  };

  beforeEach(() => {
    mockDigestRepo = {
      findByUserId: jest.fn(),
      deleteByUserId: jest.fn(),
    };
    mockCommLogRepo = {
      create: jest.fn(),
    };
    mockDb = {} as Db;
    mockTransport = {
      send: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('should do nothing when no pending items exist for user', async () => {
    mockDigestRepo.findByUserId.mockResolvedValue([]);

    const sender = new DigestSender(
      mockDb,
      mockTransport,
      'from@test.com',
      'Test',
      'https://example.com',
      mockDigestRepo as never,
      mockCommLogRepo as never
    );

    await sender.sendDigestForUser('user-123');

    expect(mockTransport.send).not.toHaveBeenCalled();
    expect(mockDigestRepo.deleteByUserId).not.toHaveBeenCalled();
  });

  it('should send one email per recipient with grouped items', async () => {
    const items: IEmailDigestPendingItem[] = [
      makeItem({
        recipientEmail: 'parent1@test.com',
        alertType: 'missing_assignment',
        severity: 'high',
        subject: 'Missing Assignment',
        body: 'Math homework due today',
      }),
      makeItem({
        recipientEmail: 'parent1@test.com',
        alertType: 'grade_drop',
        severity: 'medium',
        subject: 'Grade Drop',
        body: 'Science grade dropped from A to B',
      }),
      makeItem({
        recipientEmail: 'parent2@test.com',
        alertType: 'missing_assignment',
        severity: 'high',
        subject: 'Missing Assignment',
        body: 'Math homework due today',
      }),
    ];
    mockDigestRepo.findByUserId.mockResolvedValue(items);
    mockDigestRepo.deleteByUserId.mockResolvedValue(undefined);
    mockCommLogRepo.create.mockResolvedValue(undefined);

    const sender = new DigestSender(
      mockDb,
      mockTransport,
      'from@test.com',
      'Test',
      'https://example.com',
      mockDigestRepo as never,
      mockCommLogRepo as never
    );

    await sender.sendDigestForUser('user-123');

    expect(mockTransport.send).toHaveBeenCalledTimes(2);
    expect(mockTransport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'parent1@test.com',
        from: { email: 'from@test.com', name: 'Test' },
      })
    );
    expect(mockTransport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'parent2@test.com',
      })
    );
    expect(mockDigestRepo.deleteByUserId).toHaveBeenCalledWith('user-123');
    expect(mockCommLogRepo.create).toHaveBeenCalledTimes(2);
  });

  it('should filter items when itemFilter is provided', async () => {
    const items: IEmailDigestPendingItem[] = [
      makeItem({
        alertType: 'urgent',
        severity: 'critical',
        subject: 'Urgent',
        body: 'Critical issue requires attention',
      }),
      makeItem({
        alertType: 'info',
        severity: 'low',
        subject: 'Info',
        body: 'Low priority informational item',
      }),
    ];
    mockDigestRepo.findByUserId.mockResolvedValue(items);
    mockDigestRepo.deleteByUserId.mockResolvedValue(undefined);
    mockCommLogRepo.create.mockResolvedValue(undefined);

    const sender = new DigestSender(
      mockDb,
      mockTransport,
      'from@test.com',
      'Test',
      'https://example.com',
      mockDigestRepo as never,
      mockCommLogRepo as never
    );

    const criticalOnly = (item: IEmailDigestPendingItem): boolean => item.severity === 'critical';
    await sender.sendDigestForUser('user-123', criticalOnly);

    expect(mockTransport.send).toHaveBeenCalledTimes(1);
    const call = (mockTransport.send as jest.Mock).mock.calls[0][0] as { html: string };
    expect(call.html).toContain('Urgent');
    expect(call.html).not.toContain('Info');
  });

  it('should include AI insight when insight service is provided', async () => {
    const items: IEmailDigestPendingItem[] = [
      makeItem({
        alertType: 'missing_assignment',
        severity: 'high',
        subject: 'Missing Assignment',
        body: 'Math homework assignment is missing',
      }),
    ];
    mockDigestRepo.findByUserId.mockResolvedValue(items);
    mockDigestRepo.deleteByUserId.mockResolvedValue(undefined);
    mockCommLogRepo.create.mockResolvedValue(undefined);

    const mockInsightService: IDigestInsightService = {
      generateInsight: jest.fn().mockResolvedValue('AI says: Focus on Math this week.'),
    };

    const sender = new DigestSender(
      mockDb,
      mockTransport,
      'from@test.com',
      'Test',
      'https://example.com',
      mockDigestRepo as never,
      mockCommLogRepo as never,
      mockInsightService
    );

    await sender.sendDigestForUser('user-123');

    expect(mockInsightService.generateInsight).toHaveBeenCalledWith(items, 'Ava');
    expect(mockTransport.send).toHaveBeenCalled();
    const call = (mockTransport.send as jest.Mock).mock.calls[0][0] as { html: string };
    expect(call.html).toContain('AI says: Focus on Math this week.');
  });

  it('should log comm record on send success', async () => {
    const items: IEmailDigestPendingItem[] = [
      makeItem({
        alertType: 'alert',
        severity: 'high',
        subject: 'Alert',
        body: 'Important alert message',
      }),
    ];
    mockDigestRepo.findByUserId.mockResolvedValue(items);
    mockDigestRepo.deleteByUserId.mockResolvedValue(undefined);
    mockCommLogRepo.create.mockResolvedValue(undefined);

    const sender = new DigestSender(
      mockDb,
      mockTransport,
      'from@test.com',
      'Test',
      'https://example.com',
      mockDigestRepo as never,
      mockCommLogRepo as never
    );

    await sender.sendDigestForUser('user-123');

    expect(mockCommLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        channel: 'email',
        status: 'sent',
        recipientEmail: 'parent@test.com',
      })
    );
  });

  it('should log comm record on send failure and not throw', async () => {
    const items: IEmailDigestPendingItem[] = [
      makeItem({
        alertType: 'alert',
        severity: 'high',
        subject: 'Alert',
        body: 'Important alert message',
      }),
    ];
    mockDigestRepo.findByUserId.mockResolvedValue(items);
    mockDigestRepo.deleteByUserId.mockResolvedValue(undefined);
    mockCommLogRepo.create.mockResolvedValue(undefined);
    mockTransport.send = jest.fn().mockRejectedValue(new Error('SendGrid error'));

    const sender = new DigestSender(
      mockDb,
      mockTransport,
      'from@test.com',
      'Test',
      'https://example.com',
      mockDigestRepo as never,
      mockCommLogRepo as never
    );

    await sender.sendDigestForUser('user-123');

    expect(mockCommLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        channel: 'email',
        status: 'failed',
        failureReason: 'SendGrid error',
      })
    );
  });
});
