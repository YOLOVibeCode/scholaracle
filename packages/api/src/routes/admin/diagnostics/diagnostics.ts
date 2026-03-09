/**
 * Admin diagnostics and manual operations endpoints
 */
import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';

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
  router.post('/flush-digests', async (req: Request, res: Response) => {
    try {
      const { userId } = req.body as { userId?: string };

      if (!userId) {
        res.status(400).json({ success: false, error: 'userId is required' });
        return;
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/admin/diagnostics/pending-digests/:userId
   * Check pending digest items for a user
   */
  router.get('/pending-digests/:userId', async (req: Request, res: Response) => {
    try {
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
