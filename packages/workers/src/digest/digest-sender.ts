/**
 * DigestSender implementation — sends pending digest emails for a user.
 * Follows ISP (M2) and TDD (M1) principles.
 */

import type { Db } from 'mongodb';
import type { IEmailDigestPendingItem } from '@scholaracle/database';
import { buildDigestEmail } from '@scholaracle/agents';
import type { IEmailTransport, IDigestInsightService, IDigestSender } from './interfaces';
import type { ICommunicationLogData } from '@scholaracle/database';

export class DigestSender implements IDigestSender {
  constructor(
    _database: Db,
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
        aiInsight,
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
}
