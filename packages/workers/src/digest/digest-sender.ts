/* eslint-disable complexity */
/**
 * DigestSender implementation — sends pending digest emails for a user.
 * Follows ISP (M2) and TDD (M1) principles.
 */

import type { Db } from 'mongodb';
import type { IEmailDigestPendingItem } from '@scholaracle/database';
import { buildDigestEmail, type IGradeBlock } from '@scholaracle/agents';
import type { IEmailTransport, IDigestInsightService, IDigestSender } from './interfaces';
import type { ICommunicationLogData } from '@scholaracle/database';

/** F &lt;70, D 70-79, C 80-84, B 85-92, A 93+. */
function percentToLetter(percent: number): string {
  if (percent < 70) return 'F';
  if (percent < 80) return 'D';
  if (percent < 85) return 'C';
  if (percent < 93) return 'B';
  return 'A';
}

export class DigestSender implements IDigestSender {
  constructor(
    private readonly _database: Db,
    private readonly _transport: IEmailTransport,
    private readonly _fromEmail: string,
    private readonly _fromName: string,
    private readonly _dashboardBaseUrl: string,
    private readonly _digestRepo: {
      findByUserId(userId: string): Promise<readonly IEmailDigestPendingItem[]>;
      deleteByUserId(userId: string): Promise<number | void>;
    },
    private readonly _commLogRepo: {
      create(log: ICommunicationLogData): Promise<unknown>;
    },
    private readonly _insightService?: IDigestInsightService
  ) {}

  async sendDigestForUser(
    userId: string,
    itemFilter?: (item: IEmailDigestPendingItem) => boolean
  ): Promise<void> {
    let items = await this._digestRepo.findByUserId(userId);
    if (itemFilter) items = items.filter(itemFilter);
    if (items.length === 0) return;

    const byRecipient = new Map<string, IEmailDigestPendingItem[]>();
    for (const item of items) {
      const list = byRecipient.get(item.recipientEmail) ?? ([] as IEmailDigestPendingItem[]);
      list.push(item);
      byRecipient.set(item.recipientEmail, list);
    }

    const grades = await this._fetchGradeBlocks(userId);

    for (const [recipientEmail, recipientItems] of byRecipient) {
      const first = recipientItems[0];
      const dashboardUrl =
        first?.dashboardUrl ??
        (this._dashboardBaseUrl ? `${this._dashboardBaseUrl}/dashboard` : undefined);

      let aiInsight: string | undefined;
      if (this._insightService) {
        try {
          aiInsight = await this._insightService.generateInsight(
            recipientItems,
            first?.studentName
          );
        } catch {
          // best-effort
        }
      }

      const { subject, html } = buildDigestEmail({
        items: recipientItems,
        dashboardUrl,
        studentName: first?.studentName,
        recipientType: first?.recipientType,
        aiInsight,
        grades,
      });
      const text = `${recipientItems.length} alert(s). View your dashboard for details.`;

      try {
        await this._transport.send({
          to: recipientEmail,
          from: { email: this._fromEmail, name: this._fromName },
          subject,
          text,
          html,
        });
        await this._commLogRepo.create({
          userId,
          channel: 'email' as const,
          type: 'notification' as const,
          subject,
          content: text,
          recipientEmail,
          status: 'sent' as const,
          sentAt: new Date(),
          triggeredBy: 'scheduled',
          templateName: 'email_digest',
        });
      } catch (err) {
        console.error(`[EmailDigest] Failed to send digest to ${recipientEmail}:`, err);
        await this._commLogRepo
          .create({
            userId,
            channel: 'email' as const,
            type: 'notification' as const,
            subject,
            content: text,
            recipientEmail,
            status: 'failed' as const,
            failedAt: new Date(),
            failureReason: err instanceof Error ? err.message : String(err),
            triggeredBy: 'scheduled',
            templateName: 'email_digest',
          })
          .catch(() => {});
      }
    }
    await this._digestRepo.deleteByUserId(userId);
  }

  /** Fetches grade snapshots and courses for userId, returns IGradeBlock[] sorted by percent ascending. */
  private async _fetchGradeBlocks(userId: string): Promise<IGradeBlock[]> {
    if (typeof this._database?.collection !== 'function') return [];
    try {
      const snapshots = await this._database
        .collection('slc_grade_snapshots')
        .find({ userId, deletedAt: null })
        .toArray();
      if (snapshots.length === 0) return [];

      const courses = await this._database
        .collection('slc_courses')
        .find({ userId, deletedAt: null })
        .toArray();
      const courseNameByExtId = new Map<string, string>();
      for (const c of courses) {
        const rec = c as {
          externalId?: string;
          courseExternalId?: string;
          record?: { title?: string };
        };
        const extId = rec.externalId ?? rec.courseExternalId;
        const title = rec.record?.title;
        if (extId && title) courseNameByExtId.set(extId, title);
      }

      let studentId: string | null = null;
      const student = await this._database.collection('students').findOne({ userId });
      if (student && (student as { _id?: unknown })._id) {
        studentId = String((student as { _id: unknown })._id);
      }

      const baseUrl = this._dashboardBaseUrl?.replace(/\/$/, '') ?? '';
      const blocks: IGradeBlock[] = [];

      for (const s of snapshots) {
        const doc = s as {
          courseExternalId?: string;
          record?: { percentGrade?: number };
        };
        const courseExternalId = doc.courseExternalId;
        const percent = doc.record?.percentGrade;
        if (courseExternalId == null || percent == null) continue;
        const courseName = courseNameByExtId.get(courseExternalId) ?? courseExternalId;
        const courseUrl =
          baseUrl && studentId
            ? `${baseUrl}/dashboard/students/${studentId}/grades?course=${encodeURIComponent(courseExternalId)}`
            : baseUrl
              ? `${baseUrl}/dashboard`
              : '';
        blocks.push({
          courseName,
          percentGrade: percent,
          letterGrade: percentToLetter(percent),
          courseUrl,
        });
      }

      blocks.sort((a, b) => a.percentGrade - b.percentGrade);
      return blocks;
    } catch {
      return [];
    }
  }
}
