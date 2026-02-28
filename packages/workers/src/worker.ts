import { createServer } from 'http';
import { MongoClient, type Db } from 'mongodb';
import {
  MongoQueue,
  NotificationWorker,
  NotificationService,
  resolveAllAlertRecipients,
} from '@scholaracle/agents';
import { SyncWorker, SyncScheduler } from '@scholaracle/agents';
import type { AdapterRunnerFn } from '@scholaracle/agents';
import { StudentNotificationGenerator } from '@scholaracle/agents';
import { ParentNotificationGenerator } from '@scholaracle/agents';
import { DeliveryRouter } from '@scholaracle/agents';
import { EmailDelivery, SendGridTransport, SmtpTransport } from '@scholaracle/agents';
import type { IEmailTransport } from '@scholaracle/agents';
import { SMSDelivery } from '@scholaracle/agents';
import { PushDelivery } from '@scholaracle/agents';
import { InAppDelivery } from '@scholaracle/agents';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import type { MailService } from '@sendgrid/mail';
import type { Twilio } from 'twilio';
import { createAdapterRunner } from './adapter-runner';

export interface IWorkerConfig {
  readonly mongodbUri?: string;
  readonly sendGridApiKey?: string;
  readonly sendGridFromEmail?: string;
  readonly sendGridFromName?: string;
  readonly twilioAccountSid?: string;
  readonly twilioAuthToken?: string;
  readonly twilioFromNumber?: string;
  readonly firebaseProjectId?: string;
  readonly pollIntervalMs?: number;
  readonly concurrency?: number;
}

/**
 * Get SendGrid configuration from config or environment.
 *
 * @param config - Worker configuration
 * @returns SendGrid configuration
 */
function getSendGridConfig(config: IWorkerConfig): {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
} {
  return {
    apiKey: config.sendGridApiKey ?? process.env['SENDGRID_API_KEY'] ?? '',
    fromEmail:
      config.sendGridFromEmail ??
      process.env['SENDGRID_FROM_EMAIL'] ??
      'notifications@scholaracle.com',
    fromName: config.sendGridFromName ?? process.env['SENDGRID_FROM_NAME'] ?? 'Scholaracle',
  };
}

/**
 * Get Twilio configuration from config or environment.
 *
 * @param config - Worker configuration
 * @returns Twilio configuration
 */
function getTwilioConfig(config: IWorkerConfig): {
  readonly accountSid: string;
  readonly authToken: string;
  readonly fromNumber: string;
} {
  return {
    accountSid: config.twilioAccountSid ?? process.env['TWILIO_ACCOUNT_SID'] ?? '',
    authToken: config.twilioAuthToken ?? process.env['TWILIO_AUTH_TOKEN'] ?? '',
    fromNumber: config.twilioFromNumber ?? process.env['TWILIO_FROM_NUMBER'] ?? '',
  };
}

/**
 * Initialize notification service with delivery services.
 *
 * @param config - Worker configuration
 * @returns Notification service instance
 */
function initializeNotificationService(config: IWorkerConfig): NotificationService {
  const sendGridConfig = getSendGridConfig(config);
  const twilioConfig = getTwilioConfig(config);

  const twilioClient =
    twilioConfig.accountSid && twilioConfig.authToken
      ? twilio(twilioConfig.accountSid, twilioConfig.authToken)
      : ({} as unknown as Twilio);

  // Select email transport based on SMTP_HOST env var (same pattern as server.ts)
  const smtpHost = process.env['SMTP_HOST'];
  const transport: IEmailTransport = smtpHost
    ? new SmtpTransport(
        {
          host: smtpHost,
          port: Number(process.env['SMTP_PORT'] ?? 1025),
        },
        nodemailer.createTransport({
          host: smtpHost,
          port: Number(process.env['SMTP_PORT'] ?? 1025),
          secure: false,
        })
      )
    : new SendGridTransport(sendGridConfig.apiKey, sgMail as unknown as MailService);

  const emailDelivery = new EmailDelivery(
    { fromEmail: sendGridConfig.fromEmail, fromName: sendGridConfig.fromName },
    transport
  );
  const smsDelivery = new SMSDelivery(twilioConfig, twilioClient);

  const firebaseProjectId = config.firebaseProjectId ?? 'default';
  const pushDelivery = new PushDelivery({ projectId: firebaseProjectId });
  const inAppDelivery = new InAppDelivery();

  const deliveryRouter = new DeliveryRouter([
    emailDelivery,
    smsDelivery,
    pushDelivery,
    inAppDelivery,
  ]);

  const studentGenerator = new StudentNotificationGenerator();
  const parentGenerator = new ParentNotificationGenerator();

  return new NotificationService(studentGenerator, parentGenerator, deliveryRouter);
}

/**
 * Start the notification worker.
 *
 * @param config - Worker configuration
 */
export async function startWorker(config: IWorkerConfig = {}): Promise<void> {
  const mongodbUri =
    config.mongodbUri ??
    process.env['MONGODB_URI'] ??
    process.env['MONGO_URL'] ??
    'mongodb://localhost:27017';
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';

  // Connect to MongoDB
  const mongoClient = new MongoClient(mongodbUri);
  await mongoClient.connect();
  const database: Db = mongoClient.db(dbName);

  // Initialize queue
  const mongoQueue = new MongoQueue(database);

  // Initialize notification service
  const notificationService = initializeNotificationService(config);

  // Resolve all alert recipients for a student (owner + accepted contacts)
  const resolveAll = (studentId: string): ReturnType<typeof resolveAllAlertRecipients> =>
    resolveAllAlertRecipients(studentId, database);

  // Initialize worker
  const pollIntervalMs = config.pollIntervalMs ?? 1000;
  const concurrency = config.concurrency ?? 10;
  const notificationWorker = new NotificationWorker(mongoQueue, notificationService, {
    pollIntervalMs,
    concurrency,
    resolveAllAlertRecipients: resolveAll,
  });

  // Start notification worker
  notificationWorker.start();

  // -----------------------------------------------------------------------
  // Sync worker + scheduler (runs adapters server-side)
  // -----------------------------------------------------------------------
  const adapterRunner: AdapterRunnerFn = createAdapterRunner(database);

  const syncWorker = new SyncWorker(mongoQueue, database, {
    pollIntervalMs: 5000,
    concurrency: 2,
    decryptCredentials: (encrypted: { encrypted: string; iv: string }): string => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { decryptCredentials } = require('./credentials-cipher');
      return decryptCredentials(encrypted);
    },
    runAdapter: adapterRunner,
  });
  syncWorker.start();

  const syncScheduler = new SyncScheduler(mongoQueue, database, {
    tickIntervalMs: 60_000,
  });
  syncScheduler.start();

  // eslint-disable-next-line no-console
  console.log('Sync worker + scheduler started');

  // Minimal HTTP server for Railway health check (GET /api/health)
  const port = parseInt(process.env['PORT'] ?? '3003', 10);
  const healthServer = createServer((req, res) => {
    if (req.url === '/api/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  healthServer.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Health check server listening on port ${port}`);
  });

  // eslint-disable-next-line no-console
  console.log('Notification worker started');

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log('Shutting down worker...');
    healthServer.close();
    await syncScheduler.stop();
    await syncWorker.stop();
    await notificationWorker.stop();
    await mongoClient.close();
    // eslint-disable-next-line no-console
    console.log('Worker stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
}

// Start worker if this file is run directly
if (require.main === module) {
  startWorker().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start worker:', error);
    process.exit(1);
  });
}
