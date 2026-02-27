import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { RRule } from 'rrule';
import { AuthService } from '@scholaracle/auth';
import { AgendaIntelligenceService } from '@scholaracle/agents';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { AgendaOverrideRepository, StudentRepository, UserRepository } from '@scholaracle/database';
import type { NotificationService } from '@scholaracle/agents';

export interface IAgendaRouterConfig {
  readonly database: Db;
  readonly notificationService?: NotificationService;
}

export type AgendaImportance = 'critical' | 'high' | 'medium' | 'low';

export interface IAgendaReminder {
  readonly channel: 'sms' | 'email';
  readonly sentAt: string;
  readonly status: 'sent' | 'delivered' | 'failed';
}

export interface IAgendaItem {
  readonly id: string;
  readonly type: 'assignment' | 'event_occurrence';
  readonly title: string;
  readonly timeAt: string; // ISO
  readonly studentExternalId?: string;
  readonly institutionExternalId?: string;
  readonly courseExternalId?: string;
  readonly courseName?: string;
  readonly snoozedUntil?: string;
  /** Resolved from students collection (studentId === studentExternalId). */
  readonly studentName?: string;
  /** True when timeAt < now for assignments. */
  readonly isOverdue?: boolean;
  readonly assignmentStatus?: 'missing' | 'submitted' | 'graded' | 'late' | 'unknown';
  readonly eventCategory?:
    | 'test'
    | 'quiz'
    | 'classwork'
    | 'project'
    | 'meeting'
    | 'field_trip'
    | 'activity'
    | 'deadline'
    | 'other';
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly labels: string[];
  readonly importance: AgendaImportance;
  readonly aiSummary?: string;
  readonly reminders: IAgendaReminder[];
}

function parseDateParam(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function makeOccurrenceKey(seriesDoc: Record<string, unknown>, occurrenceStart: Date): string {
  const base = `${seriesDoc['userId']}|${seriesDoc['provider']}|${seriesDoc['adapterId']}|${seriesDoc['externalId']}|${occurrenceStart.toISOString()}`;
  return Buffer.from(base).toString('base64url');
}

function makeAssignmentOccurrenceKey(doc: Record<string, unknown>, dueAtIso: string): string {
  const base = `${doc['userId']}|${doc['provider']}|${doc['adapterId']}|${doc['externalId']}|${dueAtIso}`;
  return Buffer.from(base).toString('base64url');
}

type AssignmentStatus = 'missing' | 'submitted' | 'graded' | 'late' | 'unknown';
type EventCategory =
  | 'test'
  | 'quiz'
  | 'classwork'
  | 'project'
  | 'meeting'
  | 'field_trip'
  | 'activity'
  | 'deadline'
  | 'other';

function computeLabelsAndImportance(
  type: 'assignment' | 'event_occurrence',
  isOverdue: boolean,
  assignmentStatus?: AssignmentStatus,
  eventCategory?: EventCategory,
  timeAt?: string
): { labels: string[]; importance: AgendaImportance } {
  const labels: string[] = [];
  let importance: AgendaImportance = 'medium';

  if (type === 'assignment') {
    labels.push('assignment');
    if (assignmentStatus) labels.push(assignmentStatus);
    if (isOverdue) {
      labels.push('overdue');
      importance = 'critical';
    } else if (timeAt) {
      const due = new Date(timeAt);
      const now = new Date();
      const hoursUntil = (due.getTime() - now.getTime()) / (60 * 60 * 1000);
      if (hoursUntil <= 24 && hoursUntil > 0) labels.push('due-today');
      if (hoursUntil <= 48 && hoursUntil > 24) labels.push('due-tomorrow');
      if (hoursUntil <= 24 && hoursUntil > 0)
        importance = importance === 'medium' ? 'high' : importance;
      if (hoursUntil <= 0 && !isOverdue) importance = 'high';
    }
    if (assignmentStatus === 'missing') importance = importance === 'medium' ? 'high' : importance;
    if (assignmentStatus === 'graded') labels.push('graded');
  } else {
    labels.push('event');
    if (eventCategory) labels.push(eventCategory);
    if (eventCategory === 'test' || eventCategory === 'quiz') importance = 'high';
    if (timeAt) {
      const at = new Date(timeAt);
      const now = new Date();
      const hoursUntil = (at.getTime() - now.getTime()) / (60 * 60 * 1000);
      if (hoursUntil <= 24 && hoursUntil > 0) labels.push('due-today');
      if (hoursUntil <= 48 && hoursUntil > 24) labels.push('due-tomorrow');
    }
  }

  return { labels, importance };
}

export function agendaRouter(config: IAgendaRouterConfig): Router {
  const router = Router();
  const authService = new AuthService(config.database);
  const overridesRepo = new AgendaOverrideRepository(config.database);
  const studentRepo = new StudentRepository(config.database);

  // GET /api/agenda?from=...&to=...
  router.get(
    '/',
    authMiddleware(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as unknown as { userId?: string }).userId ?? '';
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const from = parseDateParam(req.query['from']);
      const to = parseDateParam(req.query['to']);
      if (!from || !to) {
        res.status(400).json({ success: false, error: 'Missing from/to ISO timestamps' });
        return;
      }

      const now = new Date();
      const activeSnoozes = await overridesRepo.listActiveSnoozes({ userId, now });
      const snoozeMap = new Map<string, Date>();
      for (const s of activeSnoozes) {
        snoozeMap.set(`${s.itemType}:${s.itemKey}`, s.snoozedUntil);
      }

      const students = await studentRepo.findByUserId(userId);
      const studentNameByExternalId = new Map<string, string>();
      for (const s of students) {
        if (s.studentId) studentNameByExternalId.set(s.studentId, s.name);
      }
      const pendingColl = config.database.collection('slc_pending_student_reconciliation');
      const linkedPending = await pendingColl
        .find({ userId, linkedStudentId: { $nin: [null, undefined, ''] } })
        .toArray();
      for (const p of linkedPending) {
        const extId = p['studentExternalId'] as string | undefined;
        const linkedId = p['linkedStudentId'] as string | undefined;
        if (extId && linkedId) {
          const student = await studentRepo.findById(linkedId);
          if (student) studentNameByExternalId.set(extId, student.name);
        }
      }

      const courseDocs = await config.database
        .collection('slc_courses')
        .find({ userId, deletedAt: null })
        .toArray();
      const courseMap = new Map<string, string>();
      for (const courseDoc of courseDocs) {
        const courseExternalId = courseDoc['externalId'] as string | undefined;
        const courseName = courseDoc['record']?.name as string | undefined;
        if (courseExternalId && courseName) {
          courseMap.set(courseExternalId, courseName);
        }
      }

      const itemIds: string[] = [];
      const items: IAgendaItem[] = [];

      const assignmentDocs = await config.database
        .collection('slc_assignments')
        .find({
          userId,
          deletedAt: null,
          'record.dueAt': { $gte: from.toISOString(), $lte: to.toISOString() },
        })
        .toArray();

      for (const doc of assignmentDocs) {
        const dueAt = (doc['record']?.dueAt as string | undefined) ?? undefined;
        if (!dueAt) continue;
        const itemKey = makeAssignmentOccurrenceKey(doc, dueAt);
        const snoozedUntil = snoozeMap.get(`assignment:${itemKey}`);
        if (snoozedUntil) continue;
        const courseExternalId = doc['courseExternalId'] as string | undefined;
        const studentExternalId = doc['studentExternalId'] as string | undefined;
        const status = doc['record']?.status as AssignmentStatus | undefined;
        const pointsPossible = doc['record']?.pointsPossible as number | undefined;
        const pointsEarned = doc['record']?.pointsEarned as number | undefined;
        const isOverdue = new Date(dueAt).getTime() < now.getTime();
        const id = `assignment:${itemKey}`;
        itemIds.push(id);
        const { labels, importance } = computeLabelsAndImportance(
          'assignment',
          isOverdue,
          status,
          undefined,
          dueAt
        );
        const studentName = studentExternalId
          ? (studentNameByExternalId.get(studentExternalId) ?? studentExternalId)
          : undefined;
        items.push({
          id,
          type: 'assignment',
          title: doc['record']?.title ?? 'Assignment',
          timeAt: dueAt,
          studentExternalId,
          institutionExternalId: doc['institutionExternalId'] as string | undefined,
          courseExternalId,
          courseName: courseExternalId ? courseMap.get(courseExternalId) : undefined,
          studentName,
          isOverdue,
          assignmentStatus: status,
          pointsPossible,
          pointsEarned,
          labels,
          importance,
          reminders: [],
        });
      }

      const seriesDocs = await config.database
        .collection('slc_event_series')
        .find({ userId, deletedAt: null })
        .toArray();

      for (const series of seriesDocs) {
        const r = series['record'];
        const rrule = r?.recurrence?.rrule as string | undefined;
        const dtstart = r?.startsAt as string | undefined;
        const title = r?.title as string | undefined;
        const category = r?.category as EventCategory | undefined;
        if (!rrule || !dtstart) continue;

        const parsed = RRule.fromString(rrule);
        const rule = new RRule({ ...parsed.options, dtstart: new Date(dtstart) });
        const dates = rule.between(from, to, true);
        for (const d of dates) {
          const itemKey = makeOccurrenceKey(series, d);
          const snoozedUntil = snoozeMap.get(`event_occurrence:${itemKey}`);
          if (snoozedUntil) continue;
          const id = `event_occurrence:${itemKey}`;
          itemIds.push(id);
          const studentExternalId = series['studentExternalId'] as string | undefined;
          const { labels, importance } = computeLabelsAndImportance(
            'event_occurrence',
            false,
            undefined,
            category,
            d.toISOString()
          );
          const studentName = studentExternalId
            ? (studentNameByExternalId.get(studentExternalId) ?? studentExternalId)
            : undefined;
          items.push({
            id,
            type: 'event_occurrence',
            title: title ?? 'Event',
            timeAt: d.toISOString(),
            studentExternalId,
            institutionExternalId: series['institutionExternalId'] as string | undefined,
            studentName,
            eventCategory: category,
            labels,
            importance,
            reminders: [],
          });
        }
      }

      const agendaAI = new AgendaIntelligenceService({
        apiKey: process.env['ANTHROPIC_API_KEY'],
        cacheTtlMs: 5 * 60 * 1000,
      });
      if (agendaAI.isAvailable() && items.length > 0) {
        const enhancements = await agendaAI.enhance(items);
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item) continue;
          const enh = enhancements.get(item.id);
          if (enh) {
            const mergedLabels = [...item.labels, ...enh.labels];
            (items as IAgendaItem[])[i] = {
              ...item,
              importance: enh.importance,
              labels: mergedLabels,
              aiSummary: enh.aiSummary,
            };
          }
        }
      }

      if (itemIds.length > 0) {
        const commLogs = await config.database
          .collection('communication_logs')
          .find({
            userId,
            relatedEntityType: 'agenda_item',
            relatedEntityId: { $in: itemIds },
          })
          .sort({ createdAt: -1 })
          .toArray();

        const remindersByItemId = new Map<string, IAgendaReminder[]>();
        for (const log of commLogs) {
          const itemId = log['relatedEntityId'] as string | undefined;
          if (!itemId) continue;
          const channel = log['channel'] as string;
          if (channel !== 'sms' && channel !== 'email') continue;
          const sentAt = log['sentAt'] ?? log['createdAt'];
          const status = log['status'] as string;
          const r: IAgendaReminder = {
            channel: channel as 'sms' | 'email',
            sentAt: sentAt instanceof Date ? sentAt.toISOString() : String(sentAt),
            status:
              status === 'failed' || status === 'bounced'
                ? 'failed'
                : status === 'delivered' || status === 'opened' || status === 'clicked'
                  ? 'delivered'
                  : 'sent',
          };
          const arr = remindersByItemId.get(itemId) ?? [];
          arr.push(r);
          remindersByItemId.set(itemId, arr);
        }

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item) continue;
          const rem = remindersByItemId.get(item.id);
          if (rem?.length) {
            (items as IAgendaItem[])[i] = { ...item, reminders: rem };
          }
        }
      }

      items.sort((a, b) => a.timeAt.localeCompare(b.timeAt));
      res.status(200).json({ success: true, data: { items } });
    })
  );

  // POST /api/agenda/snooze { itemType, itemKey, snoozedUntil, scope }
  router.post(
    '/snooze',
    authMiddleware(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as unknown as { userId?: string }).userId ?? '';
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { itemType, itemKey, snoozedUntil, scope } = req.body ?? {};
      if (!itemType || !itemKey || !snoozedUntil) {
        res.status(400).json({ success: false, error: 'Missing itemType/itemKey/snoozedUntil' });
        return;
      }

      const until = new Date(snoozedUntil);
      if (Number.isNaN(until.getTime())) {
        res.status(400).json({ success: false, error: 'Invalid snoozedUntil' });
        return;
      }

      const saved = await overridesRepo.upsertSnooze({
        userId,
        itemType,
        itemKey,
        scope: scope === 'series' ? 'series' : 'occurrence',
        snoozedUntil: until,
      });

      res
        .status(200)
        .json({ success: true, data: { snoozedUntil: saved.snoozedUntil.toISOString() } });
    })
  );

  // POST /api/agenda/remind { itemId, channel: 'sms'|'email', title?, studentName?, courseName?, timeAt? }
  router.post(
    '/remind',
    authMiddleware(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userId = (req as unknown as { userId?: string }).userId ?? '';
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      if (!config.notificationService) {
        res.status(503).json({ success: false, error: 'Reminder service not configured' });
        return;
      }

      const { itemId, channel, title, studentName, courseName, timeAt } = req.body ?? {};
      if (!itemId || typeof itemId !== 'string') {
        res.status(400).json({ success: false, error: 'Missing itemId' });
        return;
      }
      if (channel !== 'sms' && channel !== 'email') {
        res.status(400).json({ success: false, error: 'channel must be sms or email' });
        return;
      }

      const userRepo = new UserRepository(config.database);
      const user = await userRepo.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      const recipient = channel === 'email' ? user.email : user.phone;
      if (!recipient) {
        res.status(400).json({
          success: false,
          error: channel === 'email' ? 'No email on file' : 'No phone number on file',
        });
        return;
      }

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recent = await config.database.collection('communication_logs').findOne({
        userId,
        relatedEntityType: 'agenda_item',
        relatedEntityId: itemId,
        createdAt: { $gte: oneHourAgo },
      });
      if (recent) {
        res.status(429).json({ success: false, error: 'One reminder per item per hour' });
        return;
      }

      const displayTitle = typeof title === 'string' && title.length > 0 ? title : 'Upcoming item';
      const parts = [displayTitle];
      if (studentName) parts.push(String(studentName));
      if (courseName) parts.push(String(courseName));
      const timeStr = timeAt ? new Date(timeAt).toLocaleString() : '';
      if (timeStr) parts.push(`Due ${timeStr}`);
      const body = `Reminder: ${parts.join(' — ')}.`;
      const subject = `Scholaracle: ${displayTitle}`;

      try {
        const result = await config.notificationService.sendReminder(
          recipient,
          channel,
          subject,
          body
        );

        await config.database.collection('communication_logs').insertOne({
          userId,
          channel,
          type: 'notification',
          subject,
          content: body,
          recipientEmail: channel === 'email' ? recipient : undefined,
          recipientPhone: channel === 'sms' ? recipient : undefined,
          status: result.success ? 'sent' : 'failed',
          sentAt: new Date(),
          triggeredBy: 'user_action',
          relatedEntityType: 'agenda_item',
          relatedEntityId: itemId,
          createdAt: new Date(),
        });

        res.status(200).json({
          success: true,
          data: {
            sentAt: new Date().toISOString(),
            channel,
          },
        });
      } catch (err) {
        await config.database.collection('communication_logs').insertOne({
          userId,
          channel,
          type: 'notification',
          subject,
          content: body,
          recipientEmail: channel === 'email' ? recipient : undefined,
          recipientPhone: channel === 'sms' ? recipient : undefined,
          status: 'failed',
          failureReason: err instanceof Error ? err.message : 'Unknown error',
          triggeredBy: 'user_action',
          relatedEntityType: 'agenda_item',
          relatedEntityId: itemId,
          createdAt: new Date(),
        });
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : 'Failed to send reminder',
        });
      }
    })
  );

  return router;
}
