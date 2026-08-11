/**
 * Admin diagnostics and manual operations endpoints
 */
import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { ValidationError } from '@scholaracle/contracts';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface IDiagnosticsRouterConfig {
  readonly database: Db;
  readonly sendGridApiKey?: string;
  readonly sendGridFromEmail?: string;
  readonly sendGridFromName?: string;
}

/**
 * Manual digest flush - processes pending digest items and sends emails immediately
 */
async function manualFlushDigests(
  database: Db,
  userId: string,
  sendGridApiKey: string,
  fromEmail: string,
  fromName: string
): Promise<{ sent: number; recipients: string[]; errors: string[] }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(sendGridApiKey);

  const items = await database.collection('email_digest_pending').find({ userId }).toArray();

  if (items.length === 0) {
    return { sent: 0, recipients: [], errors: [] };
  }

  // Group by recipient
  const byRecipient = new Map<string, unknown[]>();
  for (const item of items) {
    const email = (item as unknown as { recipientEmail: string }).recipientEmail;
    const list = byRecipient.get(email) ?? [];
    list.push(item);
    byRecipient.set(email, list);
  }

  const recipients: string[] = [];
  const errors: string[] = [];

  for (const [recipientEmail, recipientItems] of byRecipient) {
    const first = recipientItems[0] as unknown as { studentName?: string; alertId: unknown };
    const studentName = first.studentName || 'Your Student';
    const subject = `Daily Digest for ${studentName}`;

    let html = `<h2>Scholaracle Digest for ${studentName}</h2>`;
    html += `<p>You have ${recipientItems.length} update(s):</p><ul>`;

    for (const item of recipientItems) {
      const alertId =
        typeof (item as unknown as { alertId: unknown }).alertId === 'string'
          ? new ObjectId((item as unknown as { alertId: string }).alertId)
          : (item as unknown as { alertId: unknown }).alertId;
      const alert = await database.collection('slc_alerts').findOne({ _id: alertId as never });
      if (alert) {
        html += `<li><strong>${(alert as unknown as { title: string }).title}</strong><br>${(alert as unknown as { message: string }).message}</li>`;
      }
    }

    html += '</ul><p>--<br>Scholaracle</p>';

    try {
      await sgMail.send({
        to: recipientEmail,
        from: { email: fromEmail, name: fromName },
        subject: subject,
        text: `Scholaracle Digest: ${recipientItems.length} updates for ${studentName}`,
        html: html,
      });

      recipients.push(recipientEmail);

      // Log it
      await database.collection('slc_communication_log').insertOne({
        userId: new ObjectId(userId),
        channel: 'email',
        type: 'notification',
        subject: subject,
        content: html,
        recipientEmail: recipientEmail,
        status: 'sent',
        sentAt: new Date(),
        triggeredBy: 'manual_admin',
        templateName: 'email_digest_manual',
        createdAt: new Date(),
      });
    } catch (error) {
      errors.push(`${recipientEmail}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Clear pending items
  await database.collection('email_digest_pending').deleteMany({ userId });

  return { sent: recipients.length, recipients, errors };
}

/**
 * Create diagnostics router
 */
export function createDiagnosticsRouter(config: IDiagnosticsRouterConfig): Router {
  const router = Router();

  /**
   * POST /api/admin/diagnostics/flush-digests
   * Manually flush pending digest emails for a user
   */
  router.post(
    '/flush-digests',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId } = req.body as { userId?: string };

      if (!userId) {
        throw new ValidationError('userId is required');
      }

      const sendGridApiKey = config.sendGridApiKey ?? process.env['SENDGRID_API_KEY'];
      const fromEmail =
        config.sendGridFromEmail ??
        process.env['SENDGRID_FROM_EMAIL'] ??
        'noreply@scholarmancy.com';
      const fromName =
        config.sendGridFromName ?? process.env['SENDGRID_FROM_NAME'] ?? 'Scholaracle';

      if (!sendGridApiKey) {
        res.status(500).json({ success: false, error: 'SendGrid not configured' });
        return;
      }

      const result = await manualFlushDigests(
        config.database,
        userId,
        sendGridApiKey,
        fromEmail,
        fromName
      );

      res.status(200).json({
        success: true,
        message: `Flushed digests for ${result.sent} recipient(s)`,
        ...result,
      });
    })
  );

  /**
   * GET /api/admin/diagnostics/pending-digests/:userId
   * Check pending digest items for a user
   */
  router.get(
    '/pending-digests/:userId',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId } = req.params;

      const items = await config.database
        .collection('email_digest_pending')
        .find({ userId })
        .toArray();

      const byRecipient = new Map<string, number>();
      for (const item of items) {
        const email = (item as unknown as { recipientEmail: string }).recipientEmail;
        byRecipient.set(email, (byRecipient.get(email) ?? 0) + 1);
      }

      res.status(200).json({
        success: true,
        totalItems: items.length,
        recipients: Array.from(byRecipient.entries()).map(([email, count]) => ({
          email,
          itemCount: count,
        })),
      });
    })
  );

  /**
   * POST /api/admin/diagnostics/create-sample-digest
   * Create sample digest alerts with grade data for testing
   */
  router.post(
    '/create-sample-digest',
    asyncHandler(async (req: Request, res: Response) => {
      const { userId, studentId } = req.body as { userId?: string; studentId?: string };

      if (!userId || !studentId) {
        throw new ValidationError('userId and studentId are required');
      }

      // Create various types of alerts
      const now = new Date();
      const alerts = [
        {
          userId: new ObjectId(userId),
          studentId: new ObjectId(studentId),
          studentName: 'Ava Lewis',
          type: 'grade_drop',
          severity: 'warning',
          title: 'Grade Drop: English',
          message:
            'Grade has dropped from 85% to 76% in English. Recent missing assignments may be affecting the grade.',
          metadata: {
            courseName: 'English',
            oldGrade: 85,
            newGrade: 76,
          },
          createdAt: new Date(now.getTime() - 2 * 3600000), // 2 hours ago
          read: false,
        },
        {
          userId: new ObjectId(userId),
          studentId: new ObjectId(studentId),
          studentName: 'Ava Lewis',
          type: 'assignment_due',
          severity: 'info',
          title: 'Due Tomorrow: Math Homework Ch. 12',
          message: 'Assignment "Chapter 12 Practice Problems" is due tomorrow at 11:59 PM.',
          metadata: {
            courseName: 'Algebra 1',
            assignmentTitle: 'Chapter 12 Practice Problems',
            dueDate: new Date(now.getTime() + 24 * 3600000).toISOString(),
          },
          createdAt: new Date(now.getTime() - 1 * 3600000), // 1 hour ago
          read: false,
        },
        {
          userId: new ObjectId(userId),
          studentId: new ObjectId(studentId),
          studentName: 'Ava Lewis',
          type: 'missing_assignment',
          severity: 'critical',
          title: 'Missing Assignment: Science Lab Report',
          message:
            'Lab Report #3 was due 3 days ago and is still missing. This assignment is worth 50 points.',
          metadata: {
            courseName: 'Science',
            assignmentTitle: 'Lab Report #3',
            pointsWorth: 50,
          },
          createdAt: new Date(now.getTime() - 30 * 60000), // 30 min ago
          read: false,
        },
        {
          userId: new ObjectId(userId),
          studentId: new ObjectId(studentId),
          studentName: 'Ava Lewis',
          type: 'grade_improvement',
          severity: 'positive',
          title: 'Great Work: History Grade Up',
          message:
            'History grade improved from 82% to 89% after recent test. Keep up the good work!',
          metadata: {
            courseName: 'History',
            oldGrade: 82,
            newGrade: 89,
          },
          createdAt: new Date(now.getTime() - 4 * 3600000), // 4 hours ago
          read: false,
        },
      ];

      // Insert alerts
      const alertResults = await config.database.collection('slc_alerts').insertMany(alerts);
      const alertIds = Object.values(alertResults.insertedIds);

      // Create digest pending items for all recipients
      const digestItems = [];
      let alertIndex = 0;
      for (const alertId of alertIds) {
        const alert = alerts[alertIndex];
        alertIndex++;
        if (alert) {
          // Owner
          digestItems.push({
            userId,
            alertId: alertId.toString(),
            studentId,
            studentName: 'Ava Lewis',
            recipientEmail: 'rvegajr@noctusoft.com',
            recipientType: 'parent',
            severity: alert.severity,
            alertType: alert.type,
            subject: alert.title,
            body: alert.message,
            courseName: (alert.metadata as { courseName?: string }).courseName,
            assignmentTitle: (alert.metadata as { assignmentTitle?: string }).assignmentTitle,
            createdAt: alert.createdAt,
          });
          // Shared parents
          digestItems.push({
            userId,
            alertId: alertId.toString(),
            studentId,
            studentName: 'Ava Lewis',
            recipientEmail: 'rmlewis1976@gmail.com',
            recipientType: 'parent',
            severity: alert.severity,
            alertType: alert.type,
            subject: alert.title,
            body: alert.message,
            courseName: (alert.metadata as { courseName?: string }).courseName,
            assignmentTitle: (alert.metadata as { assignmentTitle?: string }).assignmentTitle,
            createdAt: alert.createdAt,
          });
          digestItems.push({
            userId,
            alertId: alertId.toString(),
            studentId,
            studentName: 'Ava Lewis',
            recipientEmail: 'jdenise11@hotmail.com',
            recipientType: 'parent',
            severity: alert.severity,
            alertType: alert.type,
            subject: alert.title,
            body: alert.message,
            courseName: (alert.metadata as { courseName?: string }).courseName,
            assignmentTitle: (alert.metadata as { assignmentTitle?: string }).assignmentTitle,
            createdAt: alert.createdAt,
          });
        }
      }

      await config.database.collection('email_digest_pending').insertMany(digestItems);

      res.status(200).json({
        success: true,
        message: `Created ${alerts.length} sample alerts and queued ${digestItems.length} digest items`,
        alertCount: alerts.length,
        digestItemCount: digestItems.length,
      });
    })
  );

  /**
   * GET /api/admin/diagnostics/sync-status
   * Check sync jobs and runs status for diagnostics
   */
  router.get(
    '/sync-status',
    asyncHandler(async (_req: Request, res: Response) => {
      const db = config.database;

      // Check jobs collection
      const recentJobs = await db
        .collection('jobs')
        .find({ type: 'sync' })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      const jobStats = {
        pending: await db.collection('jobs').countDocuments({ type: 'sync', status: 'pending' }),
        processing: await db
          .collection('jobs')
          .countDocuments({ type: 'sync', status: 'processing' }),
        completed: await db
          .collection('jobs')
          .countDocuments({ type: 'sync', status: 'completed' }),
        failed: await db.collection('jobs').countDocuments({ type: 'sync', status: 'failed' }),
      };

      // Check sync_runs collection
      const recentSyncRuns = await db
        .collection('sync_runs')
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();

      // Check slc_runs collection
      const recentSlcRuns = await db
        .collection('slc_runs')
        .find({})
        .sort({ startedAt: -1 })
        .limit(10)
        .toArray();

      // Check for stuck jobs (processing for >5 minutes)
      const stuckJobs = await db
        .collection('jobs')
        .find({
          type: 'sync',
          status: 'processing',
          lockedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) },
        })
        .toArray();

      res.status(200).json({
        success: true,
        jobStats,
        recentJobs: recentJobs.map((j) => ({
          id: j._id,
          name: j['name'],
          status: j['status'],
          studentId: j['data']?.['studentId'],
          provider: j['data']?.['provider'],
          createdAt: j['createdAt'],
          scheduledFor: j['scheduledFor'],
          attempts: j['attempts'] || 0,
          lockedAt: j['lockedAt'],
          error: j['error'],
        })),
        recentSyncRuns: recentSyncRuns.map((r) => ({
          id: r._id,
          jobId: r['jobId'],
          status: r['status'],
          studentId: r['studentId'],
          provider: r['provider'],
          createdAt: r['createdAt'],
          completedAt: r['completedAt'],
          error: r['error'],
        })),
        recentSlcRuns: recentSlcRuns.map((r) => ({
          runId: r['runId'],
          status: r['status'],
          sourceId: r['sourceId'],
          startedAt: r['startedAt'],
          committedAt: r['committedAt'],
          error: r['error'],
        })),
        stuckJobs: stuckJobs.length,
        diagnosis: {
          jobsCreated: recentJobs.length > 0,
          syncWorkerProcessing: recentSyncRuns.length > 0,
          hasPendingJobs: jobStats.pending > 0,
          hasStuckJobs: stuckJobs.length > 0,
          issue:
            jobStats.pending > 0 && recentSyncRuns.length === 0
              ? 'Jobs are pending but SyncWorker has never processed any - workers service may not be running'
              : stuckJobs.length > 0
                ? 'Jobs are stuck in processing - workers may have crashed'
                : recentJobs.length === 0
                  ? 'No sync jobs found - syncScheduler.triggerNow() may not be called'
                  : 'System appears healthy',
        },
      });
    })
  );

  /**
   * GET /api/admin/diagnostics/student-data/:studentId
   * Query SLC collections for a student's academic data
   */
  router.get(
    '/student-data/:studentId',
    asyncHandler(async (req: Request, res: Response) => {
      const { studentId } = req.params;
      const db = config.database;

      const student = await db.collection('students').findOne({ _id: new ObjectId(studentId!) });
      const sourceIds = ((student?.['dataSources'] ?? []) as Array<{ id: string }>).map(
        (ds) => ds.id
      );

      const sourceFilter =
        sourceIds.length > 0
          ? { $or: [{ sourceId: { $in: sourceIds } }, { 'key.studentExternalId': studentId }] }
          : { 'key.studentExternalId': studentId };

      const [courses, grades, assignments, attendance] = await Promise.all([
        db.collection('slc_courses').find(sourceFilter).sort({ updatedAt: -1 }).limit(50).toArray(),
        db
          .collection('slc_grade_snapshots')
          .find(sourceFilter)
          .sort({ updatedAt: -1 })
          .limit(50)
          .toArray(),
        db
          .collection('slc_assignments')
          .find(sourceFilter)
          .sort({ updatedAt: -1 })
          .limit(50)
          .toArray(),
        db
          .collection('slc_attendance_events')
          .find(sourceFilter)
          .sort({ updatedAt: -1 })
          .limit(50)
          .toArray(),
      ]);

      res.status(200).json({
        success: true,
        studentId,
        counts: {
          courses: courses.length,
          grades: grades.length,
          assignments: assignments.length,
          attendance: attendance.length,
        },
        courses: courses.map((c) => ({
          title: c['record']?.['title'],
          externalId: c['key']?.['externalId'],
          provider: c['key']?.['provider'],
          updatedAt: c['updatedAt'],
        })),
        grades: grades.map((g) => ({
          courseExternalId: g['record']?.['courseExternalId'],
          letterGrade: g['record']?.['letterGrade'],
          percentage: g['record']?.['percentage'],
          asOfDate: g['record']?.['asOfDate'],
          provider: g['key']?.['provider'],
          updatedAt: g['updatedAt'],
        })),
      });
    })
  );

  return router;
}
