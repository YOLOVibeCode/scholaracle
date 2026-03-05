/**
 * Script: trigger sync for Ava (all sources), wait for completion, then send digest.
 * Usage: npx ts-node src/scripts/trigger-sync-and-digest.ts --studentId=<id>
 * Env: MONGODB_URI, SENDGRID_API_KEY (or SMTP_*), BASE_URL, API_BASE_URL, AUTH_TOKEN
 */

import { MongoClient } from 'mongodb';
import { SendGridTransport, SmtpTransport, type IEmailTransport } from '@scholaracle/agents';
import { DigestInsightService, LlmClient } from '@scholaracle/agents';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import type { MailService } from '@sendgrid/mail';
import { EmailDigestPendingRepository, CommunicationLogRepository } from '@scholaracle/database';
import { SyncTrigger, SyncStatusPoller, StudentRecipientResolver } from '../digest/sync-client';
import { DigestSender } from '../digest/digest-sender';

const POLL_INTERVAL_MS = 15_000;
const MAX_WAIT_MS = 15 * 60 * 1000;

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
  return new SendGridTransport(apiKey, sgMail as unknown as MailService);
}

async function waitForSyncComplete(
  poller: SyncStatusPoller,
  studentId: string,
  expectedCount: number
): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const runs = await poller.getRuns(studentId, expectedCount);
    const latest = runs.slice(0, expectedCount);
    if (latest.length < expectedCount) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    const allCompleted = latest.every((r) => r.status === 'completed');
    const anyFailed = latest.some((r) => r.status === 'failed');
    if (anyFailed) {
      throw new Error(`One or more sync runs failed: ${latest.map((r) => r.status).join(', ')}`);
    }
    if (allCompleted) return;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Sync did not complete within ${MAX_WAIT_MS / 60_000} minutes`);
}

async function main(): Promise<void> {
  const studentId = getArg('studentId');
  const apiUrl =
    getArg('apiUrl') ?? process.env['API_BASE_URL'] ?? process.env['BASE_URL'] ?? 'http://localhost:3000';
  const token = getArg('token') ?? process.env['AUTH_TOKEN'] ?? process.env['API_TOKEN'];

  if (!studentId) {
    console.error('Usage: --studentId=<id> [--apiUrl=<url>] [--token=<bearer>]');
    process.exit(1);
  }
  if (!token) {
    console.error('Provide --token= or AUTH_TOKEN for API auth.');
    process.exit(1);
  }

  const uri = process.env['MONGODB_URI'] ?? process.env['MONGO_URL'] ?? 'mongodb://localhost:27017';
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';
  const client = new MongoClient(uri);
  await client.connect();
  const database = client.db(dbName);

  const trigger = new SyncTrigger(apiUrl, token);
  const poller = new SyncStatusPoller(apiUrl, token);
  const recipientResolver = new StudentRecipientResolver(database);

  console.log('Triggering sync for student', studentId, '...');
  const { jobIds } = await trigger.triggerAllForStudent(studentId);
  console.log('Enqueued', jobIds.length, 'job(s). Waiting for completion ...');

  await waitForSyncComplete(poller, studentId, jobIds.length);
  console.log('Sync completed successfully.');

  console.log('Resolving alert recipients ...');
  const userIds = await recipientResolver.resolveRecipients(studentId);
  if (userIds.length === 0) {
    console.log('No recipient users for student; skipping digest.');
    await client.close();
    return;
  }
  console.log('Sending digest to', userIds.length, 'recipient(s) ...');

  const fromEmail =
    process.env['SENDGRID_FROM_EMAIL'] ?? process.env['FROM_EMAIL'] ?? 'notifications@scholaracle.com';
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
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
