import type { Db } from 'mongodb';
import type { IEmailTransport } from '@scholaracle/agents';
import type { GlanceInsightService } from '@scholaracle/agents';
import {
  CommunicationLogRepository,
  StudentRepository,
  UserRepository,
} from '@scholaracle/database';
import { GlanceSender } from './glance-sender';
import { userLocalHhmm, userLocalDateYmd } from '../digest/timezone-utils';

interface IUserGlanceDoc {
  _id: unknown;
  timezone?: string;
  email?: string;
  preferences?: {
    notifications?: {
      glanceSchedule?: { enabled?: boolean; time?: string };
    };
  };
}

export async function flushGlanceEmails(
  database: Db,
  transport: IEmailTransport,
  fromEmail: string,
  fromName: string,
  dashboardBaseUrl: string,
  insightService?: GlanceInsightService
): Promise<void> {
  const userRepo = new UserRepository(database);
  const studentRepo = new StudentRepository(database);
  const commLogRepo = new CommunicationLogRepository(database);

  const now = new Date();

  const userDocs = (await database
    .collection('users')
    .find({
      'preferences.notifications.glanceSchedule.enabled': true,
      isSuspended: { $ne: true },
    })
    .project({ _id: 1, timezone: 1, preferences: 1, email: 1 })
    .toArray()) as unknown as IUserGlanceDoc[];

  for (const doc of userDocs) {
    try {
      const userId = String(doc._id);
      const tz = doc.timezone ?? 'America/New_York';
      const glanceTime = doc.preferences?.notifications?.glanceSchedule?.time ?? '07:00';
      const currentHhmm = userLocalHhmm(now, tz);

      if (currentHhmm !== glanceTime) continue;

      const todayYmd = userLocalDateYmd(now, tz);

      const students = await studentRepo.findByUserId(userId);
      if (students.length === 0) continue;

      const user = await userRepo.findById(userId);
      if (!user) continue;

      const schedule = user.preferences?.notifications?.digestSchedule;
      const recipientMode = schedule?.recipients ?? 'everybody';
      if (recipientMode === 'nobody') continue;

      const recipientEmails: string[] = [];
      if (recipientMode === 'specific') {
        recipientEmails.push(...((schedule?.specificRecipients as string[]) ?? []));
      } else {
        recipientEmails.push(user.email);
      }
      if (recipientEmails.length === 0) continue;

      const glanceSender = new GlanceSender(
        database,
        transport,
        fromEmail,
        fromName,
        dashboardBaseUrl,
        commLogRepo,
        insightService
      );

      for (const student of students) {
        const studentId = String(student._id);

        const alreadySent = await database.collection('communication_logs').findOne({
          userId,
          templateName: 'email_glance',
          relatedEntityId: studentId,
          status: 'sent',
          sentAt: {
            $gte: new Date(`${todayYmd}T00:00:00.000Z`),
            $lt: new Date(`${todayYmd}T23:59:59.999Z`),
          },
        });
        if (alreadySent) continue;

        for (const recipientEmail of recipientEmails) {
          await glanceSender.sendGlanceForStudent(userId, studentId, student.name, recipientEmail);
        }
      }
    } catch (err) {
      console.error(`[Glance] Error processing user ${String(doc._id)}:`, err);
    }
  }
}
