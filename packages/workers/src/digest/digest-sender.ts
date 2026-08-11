/* eslint-disable complexity */
/**
 * DigestSender implementation — sends pending digest emails for a user.
 * Follows ISP (M2) and TDD (M1) principles.
 */

import type { Db } from 'mongodb';
import type { IEmailDigestPendingItem } from '@scholaracle/database';
import { logger } from '../logger';
import { buildDigestEmail } from '@scholaracle/agents';
import type { IEmailTransport, IDigestInsightService, IDigestSender } from './interfaces';
import type { ICommunicationLogData } from '@scholaracle/database';
import { fetchGradeBlocksForUser } from '../shared/grade-block-fetcher';

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
    itemFilter?: (item: IEmailDigestPendingItem) => boolean,
    allowedRecipients?: readonly string[]
  ): Promise<void> {
    let items = await this._digestRepo.findByUserId(userId);
    if (itemFilter) items = items.filter(itemFilter);
    if (items.length === 0) return;

    const byRecipient = new Map<string, IEmailDigestPendingItem[]>();
    for (const item of items) {
      if (allowedRecipients && !allowedRecipients.includes(item.recipientEmail)) continue;
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
        baseUrl: this._dashboardBaseUrl?.replace(/\/$/, '') ?? undefined,
        studentId: first?.studentId,
      });
      const text = `${recipientItems.length} alert(s). View your dashboard for details.`;
      const isPreview = recipientItems.some((item) => item.preview);

      if (isPreview) {
        // Preview mode: store in history but don't send
        await this._commLogRepo.create({
          userId,
          channel: 'email' as const,
          type: 'notification' as const,
          subject,
          content: text,
          htmlContent: html,
          recipientEmail,
          status: 'preview' as const,
          createdAt: new Date(),
          triggeredBy: 'user_action',
          templateName: 'email_digest',
          relatedEntityType: 'student',
          relatedEntityId: first?.studentId,
        });
        continue;
      }

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
          htmlContent: html,
          recipientEmail,
          status: 'sent' as const,
          sentAt: new Date(),
          triggeredBy: 'scheduled',
          templateName: 'email_digest',
          relatedEntityType: 'student',
          relatedEntityId: first?.studentId,
        });
      } catch (err) {
        logger.error({ err, recipientEmail, job: 'email-digest' }, 'failed to send digest');
        await this._commLogRepo
          .create({
            userId,
            channel: 'email' as const,
            type: 'notification' as const,
            subject,
            content: text,
            htmlContent: html,
            recipientEmail,
            status: 'failed' as const,
            failedAt: new Date(),
            failureReason: err instanceof Error ? err.message : String(err),
            triggeredBy: 'scheduled',
            templateName: 'email_digest',
            relatedEntityType: 'student',
            relatedEntityId: first?.studentId,
          })
          .catch(() => {});
      }
    }
    await this._digestRepo.deleteByUserId(userId);
  }

  private async _fetchGradeBlocks(
    userId: string
  ): Promise<import('@scholaracle/agents').IGradeBlock[]> {
    return fetchGradeBlocksForUser(this._database, userId, this._dashboardBaseUrl ?? '');
  }
}
