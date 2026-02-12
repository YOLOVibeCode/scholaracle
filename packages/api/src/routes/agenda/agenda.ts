import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { RRule } from 'rrule';
import { AuthService } from '@scholaracle/auth';
import { authMiddleware } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { AgendaOverrideRepository } from '@scholaracle/database';

export interface IAgendaRouterConfig {
  readonly database: Db;
}

export interface IAgendaItem {
  readonly id: string;
  readonly type: 'assignment' | 'event_occurrence';
  readonly title: string;
  readonly timeAt: string; // ISO
  readonly studentExternalId?: string;
  readonly institutionExternalId?: string;
  readonly courseExternalId?: string;
  readonly courseName?: string; // Resolved from slc_courses collection
  readonly snoozedUntil?: string;
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

export function agendaRouter(config: IAgendaRouterConfig): Router {
  const router = Router();
  const authService = new AuthService(config.database);
  const overridesRepo = new AgendaOverrideRepository(config.database);

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

      // Fetch all courses for this user to resolve course names
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

      const items: IAgendaItem[] = [];

      // Assignments (from SLC)
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
        items.push({
          id: `assignment:${itemKey}`,
          type: 'assignment',
          title: doc['record']?.title ?? 'Assignment',
          timeAt: dueAt,
          studentExternalId: doc['studentExternalId'] ?? undefined,
          institutionExternalId: doc['institutionExternalId'] ?? undefined,
          courseExternalId,
          courseName: courseExternalId ? courseMap.get(courseExternalId) : undefined,
        });
      }

      // Recurring events: expand RRULE occurrences for window
      const seriesDocs = await config.database
        .collection('slc_event_series')
        .find({ userId, deletedAt: null })
        .toArray();

      for (const series of seriesDocs) {
        const r = series['record'];
        const rrule = r?.recurrence?.rrule as string | undefined;
        const dtstart = r?.startsAt as string | undefined;
        const title = r?.title as string | undefined;
        if (!rrule || !dtstart) continue;

        // Apply DTSTART from the normalized record (RRULE string might not include DTSTART).
        const parsed = RRule.fromString(rrule);
        const rule = new RRule({ ...parsed.options, dtstart: new Date(dtstart) });
        const dates = rule.between(from, to, true);
        for (const d of dates) {
          const itemKey = makeOccurrenceKey(series, d);
          const snoozedUntil = snoozeMap.get(`event_occurrence:${itemKey}`);
          if (snoozedUntil) continue;
          items.push({
            id: `event_occurrence:${itemKey}`,
            type: 'event_occurrence',
            title: title ?? 'Event',
            timeAt: d.toISOString(),
            studentExternalId: series['studentExternalId'] ?? undefined,
            institutionExternalId: series['institutionExternalId'] ?? undefined,
          });
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

  return router;
}
