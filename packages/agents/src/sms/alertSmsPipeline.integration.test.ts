import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  Alert,
  AlertType,
  Notification,
  SCHOLARMANCY_SMS_PURPOSE,
  SMS_OPT_IN_TEXT_VERSION,
} from '@scholaracle/contracts';
import { CommunicationLogRepository, SmsConsentRepository } from '@scholaracle/database';
import { ParentNotificationGenerator } from '../generators/ParentNotificationGenerator';
import { SMSDelivery } from '../delivery/SMSDelivery/SMSDelivery';
import { GuardedSmsSender } from './GuardedSmsSender';
import type { NoctusoftSmsRelayClient } from './NoctusoftSmsRelayClient';
import { isGsm7 } from './gsm7';

/**
 * Alert -> real parent generator -> SMSDelivery -> GuardedSmsSender (consent) -> comm log.
 * Only the relay HTTP call is mocked; the logged body is what a parent would receive.
 */
describe('alert SMS pipeline (comm log)', () => {
  const PHONE = '+15125550100';
  let mongo: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  let relaySend: jest.Mock;
  let delivery: SMSDelivery;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    client = new MongoClient(mongo.getUri());
    await client.connect();
    db = client.db('alert_sms_pipeline_test');
    await new SmsConsentRepository(db).recordOptIn({
      phoneE164: PHONE,
      purpose: SCHOLARMANCY_SMS_PURPOSE,
      consentTextVersion: SMS_OPT_IN_TEXT_VERSION,
      source: '/register',
    });
    relaySend = jest.fn().mockResolvedValue({ messageSid: 'SMtest' });
    const relay = { send: relaySend } as unknown as NoctusoftSmsRelayClient;
    const guarded = new GuardedSmsSender(
      relay,
      new SmsConsentRepository(db),
      new CommunicationLogRepository(db)
    );
    delivery = new SMSDelivery(guarded, { webOrigin: 'https://scholarmancy.com' });
  });

  afterAll(async () => {
    await client.close();
    await mongo.stop();
  });

  const student = 'Emma Johnson';
  const course = 'AP Calculus BC (Room 204, Mrs. O\u2019Brien)';
  const cases: readonly [AlertType, Record<string, unknown>][] = [
    [AlertType.GRADE_DROP, { studentName: student, course, previousGrade: 85, currentGrade: 72 }],
    [
      AlertType.MISSING_ASSIGNMENT,
      {
        studentName: student,
        course,
        assignment: '\u201CLab 4\u201D \u2014 Cell Respiration',
        daysAgo: 2,
      },
    ],
    [
      AlertType.DEADLINE,
      {
        studentName: student,
        course,
        assignment: 'Essay draft',
        formattedDueDate: 'Tue, Oct 14, 11:59\u202FPM',
      },
    ],
    [
      AlertType.TEST,
      {
        studentName: student,
        course,
        testName: 'Unit 3 Exam',
        testDate: '2026-10-16T17:00:00Z',
        weight: 20,
        currentGrade: 88,
      },
    ],
    [AlertType.WORKLOAD, { studentName: student, assignmentCount: 5, isDueThisWeek: true }],
    [
      AlertType.POSITIVE,
      { studentName: student, course, achievement: 'raised her grade to 92% \u{1F389}' },
    ],
    [
      AlertType.RECOMMENDATION,
      {
        studentName: student,
        recommendationType: 'study',
        title: 'Review fractions before Friday',
        description: 'x',
      },
    ],
  ];

  it.each(cases)('%s logs a single-segment GSM-7 body', async (type, relatedData) => {
    const generated = new ParentNotificationGenerator().generate(
      new Alert({ type, studentId: 'stu-1', severity: 'critical', relatedData })
    );
    // NotificationService swaps userId for the recipient phone before an SMS delivery.
    const notification = Notification.fromPayload({
      ...generated,
      id: generated.id,
      userId: PHONE,
    });
    await delivery.deliver(notification);

    const sent = relaySend.mock.calls.at(-1)![1] as string;
    const logs = await new CommunicationLogRepository(db).findByUserId(PHONE);
    const logged = logs.find((l) => l.providerId === 'SMtest' && l.content === sent);
    expect(logged).toBeDefined();
    expect(sent.length).toBeLessThanOrEqual(160);
    expect(isGsm7(sent)).toBe(true);
    expect(sent).toMatch(
      /^Scholarmancy: .+\. Details: https:\/\/scholarmancy\.com\/alerts Reply STOP to opt out\.$/
    );
    expect(sent).not.toMatch(/Room 204|\.{4}/);
  });
});
