/**
 * Script: send digest now for specific users (e.g. Ava's 3 alert recipients).
 * Usage: npx ts-node src/scripts/send-digest-now.ts --studentId=<id>
 *    or: npx ts-node src/scripts/send-digest-now.ts --userIds=id1,id2,id3
 * Env: MONGODB_URI, SENDGRID_API_KEY (or SMTP_*), BASE_URL
 */

import { MongoClient } from 'mongodb';
import { SendGridTransport, SmtpTransport, type IEmailTransport } from '@scholaracle/agents';
import { DigestInsightService, LlmClient } from '@scholaracle/agents';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import type { MailService } from '@sendgrid/mail';
import { EmailDigestPendingRepository, CommunicationLogRepository } from '@scholaracle/database';
import { StudentRecipientResolver } from '../digest/sync-client';
import { DigestSender } from '../digest/digest-sender';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length).trim();
  }
  return undefined;
}

function getEmailTransport(): IEmailTransport {
  const apiKey = process.env['SENDGRID_API_KEY'] ?? '';
  const smtpHost = process.env['SMTP_HOST'];
  if (smtpHost) {
    const port = Number(process.env['SMTP_PORT'] ?? 1025);
    return new SmtpTransport(
      { host: smtpHost, port },
      nodemailer.createTransport({ host: smtpHost, port, secure: false })
    );
  }
  return new SendGridTransport(
    apiKey,
    sgMail as unknown as MailService,
    process.env['SENDGRID_BASE_URL']
  );
}

async function main(): Promise<void> {
  const studentId = getArg('studentId');
  const userIdsArg = getArg('userIds');

  let userIds: string[];
  const uri = process.env['MONGODB_URI'] ?? process.env['MONGO_URL'] ?? 'mongodb://localhost:27017';
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';
  const client = new MongoClient(uri);
  await client.connect();
  const database = client.db(dbName);

  if (studentId) {
    const resolver = new StudentRecipientResolver(database);
    userIds = await resolver.resolveRecipients(studentId);
    if (userIds.length === 0) {
      console.error('No recipient user IDs for student');
      await client.close();
      process.exit(1);
    }
  } else if (userIdsArg) {
    userIds = userIdsArg
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (userIds.length === 0) {
      console.error('Provide --studentId=<id> or --userIds=id1,id2,id3');
      await client.close();
      process.exit(1);
    }
  } else {
    console.error('Provide --studentId=<id> or --userIds=id1,id2,id3');
    await client.close();
    process.exit(1);
  }

  const fromEmail =
    process.env['SENDGRID_FROM_EMAIL'] ??
    process.env['FROM_EMAIL'] ??
    'notifications@scholarmancy.com';
  const fromName = process.env['SENDGRID_FROM_NAME'] ?? process.env['FROM_NAME'] ?? 'Scholaracle';
  const dashboardBaseUrl =
    process.env['BASE_URL'] ?? process.env['WEB_URL'] ?? process.env['NEXT_PUBLIC_APP_URL'] ?? '';
  const transport = getEmailTransport();
  const digestRepo = new EmailDigestPendingRepository(database);
  const commLogRepo = new CommunicationLogRepository(database);
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const insightService = anthropicApiKey
    ? new DigestInsightService({ llmClient: new LlmClient({ apiKey: anthropicApiKey }) })
    : undefined;

  const digestSender = new DigestSender(
    database,
    transport,
    fromEmail,
    fromName,
    dashboardBaseUrl,
    digestRepo,
    commLogRepo,
    insightService
  );

  for (const userId of userIds) {
    await digestSender.sendDigestForUser(userId);
  }

  await client.close();
  // eslint-disable-next-line no-console
  console.log('Digest send complete for', userIds.length, 'user(s)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
