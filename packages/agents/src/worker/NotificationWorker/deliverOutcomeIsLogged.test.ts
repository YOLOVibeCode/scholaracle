/**
 * A `deliver` job ends in one of three ways: the message went out, it could not go out at
 * all, or the attempt failed and the queue will try again. The last two used to leave no
 * trace in the log.
 */

import {
  AgentType,
  DeliveryError,
  NotificationChannel,
  NotificationPriority,
  type DeliveryResult,
} from '@scholaracle/contracts';
import type { ObjectId } from 'mongodb';
import { logger } from '../../logger';
import { MongoQueue, type IJob } from '../../queue/MongoQueue';
import { NotificationService } from '../../service/NotificationService';
import { NotificationWorker } from './NotificationWorker';

const JOB_ID = 'deliver-job-7';

function deliverJob(channel: NotificationChannel, attempts = 0): IJob {
  return {
    _id: { toString: (): string => JOB_ID } as unknown as ObjectId,
    type: 'deliver',
    name: 'deliver-one',
    data: {
      notificationPayload: {
        agentType: AgentType.STUDENT,
        studentId: 'student-1',
        userId: 'user-1',
        subject: 'Lab report is due tomorrow',
        body: 'Biology: Lab report',
        priority: NotificationPriority.HIGH,
        triggerType: 'test' as const,
      },
      channel,
    },
    scheduledFor: new Date(),
    priority: 5,
    status: 'processing',
    attempts,
    maxAttempts: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('how a deliver job ended is in the log', () => {
  let queue: jest.Mocked<MongoQueue>;
  let deliverOne: jest.Mock<Promise<DeliveryResult>>;
  let worker: NotificationWorker;
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    queue = { complete: jest.fn(), fail: jest.fn() } as unknown as jest.Mocked<MongoQueue>;
    deliverOne = jest.fn();
    worker = new NotificationWorker(queue, { deliverOne } as unknown as NotificationService);
    info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('a delivered message is completed and nothing is warned about', async () => {
    deliverOne.mockResolvedValue({
      success: true,
      channel: NotificationChannel.PUSH,
      messageId: 'expo-1',
    });

    await worker.processJob(deliverJob(NotificationChannel.PUSH));

    expect(queue.complete).toHaveBeenCalledWith(JOB_ID);
    expect(queue.fail).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('a message that could not go out is logged with its channel and reason, and is not retried', async () => {
    deliverOne.mockResolvedValue({
      success: false,
      channel: NotificationChannel.PUSH,
      error: 'Expo did not accept the push: DeviceNotRegistered',
    });

    await worker.processJob(deliverJob(NotificationChannel.PUSH));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        job: 'notification-worker',
        jobId: JOB_ID,
        channel: NotificationChannel.PUSH,
        reason: 'Expo did not accept the push: DeviceNotRegistered',
      },
      'notification not delivered'
    );
    expect(queue.complete).toHaveBeenCalledWith(JOB_ID);
    expect(queue.fail).not.toHaveBeenCalled();
  });

  it('a result with no reason is still logged', async () => {
    deliverOne.mockResolvedValue({ success: false, channel: NotificationChannel.SMS });

    await worker.processJob(deliverJob(NotificationChannel.SMS));

    expect(warn).toHaveBeenCalledWith(
      {
        job: 'notification-worker',
        jobId: JOB_ID,
        channel: NotificationChannel.SMS,
        reason: 'no reason given',
      },
      'notification not delivered'
    );
  });

  it('a failed attempt is logged by the kind of error and its attempt, and goes back to the queue', async () => {
    const failed = new DeliveryError(
      'Failed to deliver email: 550 mailbox parent@example.com unavailable',
      NotificationChannel.EMAIL
    );
    deliverOne.mockRejectedValue(failed);

    await worker.processJob(deliverJob(NotificationChannel.EMAIL, 2));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      {
        job: 'notification-worker',
        jobId: JOB_ID,
        channel: NotificationChannel.EMAIL,
        error: 'DeliveryError',
        attempt: 3,
        of: 5,
      },
      'notification delivery failed'
    );
    expect(queue.fail).toHaveBeenCalledWith(JOB_ID, failed);
    expect(queue.complete).not.toHaveBeenCalled();
  });

  it("the log never holds the message, the recipient or an error's text", async () => {
    deliverOne.mockRejectedValue(
      new DeliveryError(
        'Failed to deliver email: 550 mailbox parent@example.com unavailable',
        NotificationChannel.EMAIL
      )
    );

    await worker.processJob(deliverJob(NotificationChannel.EMAIL));

    const text = JSON.stringify([...info.mock.calls, ...warn.mock.calls]);
    expect(text).not.toContain('parent@example.com');
    expect(text).not.toContain('mailbox');
    expect(text).not.toContain('Lab report');
    expect(text).not.toContain('user-1');
  });

  it('a job with nothing to deliver is logged and goes back to the queue', async () => {
    const job = { ...deliverJob(NotificationChannel.EMAIL), data: {} };

    await worker.processJob(job);

    expect(deliverOne).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      { job: 'notification-worker', jobId: JOB_ID, error: 'Error', attempt: 1, of: 5 },
      'notification delivery failed'
    );
    expect(queue.fail).toHaveBeenCalledTimes(1);
  });
});
