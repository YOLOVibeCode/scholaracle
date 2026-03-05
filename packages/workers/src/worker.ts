import { createServer } from 'http';
import { MongoClient, type Db } from 'mongodb';
import {
  MongoQueue,
  NotificationWorker,
  NotificationService,
  resolveAllAlertRecipients,
  type INotificationServiceSmsDigestOptions,
  type INotificationServiceEmailDigestOptions,
  EmailNotificationAgent,
  ParentEmailNotificationAgent,
  DeliveryRouter,
  DigestInsightService,
  LlmClient,
} from '@scholaracle/agents';
import {
  UserRepository,
  SmsDigestPendingRepository,
  EmailDigestPendingRepository,
  CommunicationLogRepository,
  type IEmailDigestPendingItem,
} from '@scholaracle/database';
import { flushEmailDigests } from './digest/digest-flush';
import { SyncWorker, SyncScheduler } from '@scholaracle/agents';
import type { AdapterRunnerFn } from '@scholaracle/agents';
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
import { ConnectorTokenService } from '@scholaracle/auth';
import { randomUUID } from 'crypto';
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

/** Default UTC hour to send daily SMS and email digest (6 PM). */
const DIGEST_UTC_HOUR = 18;

const MAX_SMS_LENGTH = 1600;

/**
 * Flush pending SMS digest: send one combined SMS per user with digest enabled, then clear pending.
 * Intended to run once per day at SMS_DIGEST_UTC_HOUR.
 */
async function flushSmsDigests(
  database: Db,
  twilioClient: Twilio,
  fromNumber: string
): Promise<void> {
  const repo = new SmsDigestPendingRepository(database);
  const userIds = await repo.getDistinctUserIds();
  if (userIds.length === 0) return;

  for (const userId of userIds) {
    const items = await repo.findByUserId(userId);
    if (items.length === 0) continue;
    const phone = items[0]!.phone;
    const parts = items.map((i) => `${i.subject}\n${i.body}`);
    let body = `Scholaracle daily digest (${items.length} alert${items.length === 1 ? '' : 's'}):\n\n${parts.join('\n\n')}`;
    if (body.length > MAX_SMS_LENGTH) {
      body = `${body.substring(0, MAX_SMS_LENGTH - 3)}...`;
    }
    const commLogRepo = new CommunicationLogRepository(database);
    try {
      await twilioClient.messages.create({
        to: phone,
        from: fromNumber,
        body,
      });
      await commLogRepo.create({
        userId,
        channel: 'sms',
        type: 'notification',
        subject: `SMS Digest (${items.length} alerts)`,
        content: body,
        recipientPhone: phone,
        status: 'sent',
        sentAt: new Date(),
        triggeredBy: 'scheduled',
        templateName: 'sms_digest',
      });
      await repo.deleteByUserId(userId);
    } catch (err) {
      console.error(`[SmsDigest] Failed to send digest for user ${userId}:`, err);
      await commLogRepo
        .create({
          userId,
          channel: 'sms',
          type: 'notification',
          subject: `SMS Digest (${items.length} alerts)`,
          content: body,
          recipientPhone: phone,
          status: 'failed',
          failedAt: new Date(),
          failureReason: err instanceof Error ? err.message : String(err),
          triggeredBy: 'scheduled',
          templateName: 'sms_digest',
        })
        .catch(() => {
          /* best effort */
        });
    }
  }
}

/**
 * Create email transport from config (SendGrid or SMTP).
 */
function getEmailTransport(config: IWorkerConfig): IEmailTransport {
  const sendGridConfig = getSendGridConfig(config);
  const smtpHost = process.env['SMTP_HOST'];
  return smtpHost
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
}

/**
 * Initialize notification service with delivery services.
 * When database is provided, wires SMS and email digest (batch alerts into one daily message per user).
 *
 * @param config - Worker configuration
 * @param database - Optional DB for digest preference and pending queue
 * @param emailTransport - Optional shared email transport (for digest flush); when not provided, created internally
 * @returns Notification service instance
 */
function initializeNotificationService(
  config: IWorkerConfig,
  database?: Db,
  emailTransport?: IEmailTransport
): NotificationService {
  const sendGridConfig = getSendGridConfig(config);
  const twilioConfig = getTwilioConfig(config);

  const twilioClient =
    twilioConfig.accountSid && twilioConfig.authToken
      ? twilio(twilioConfig.accountSid, twilioConfig.authToken)
      : ({} as unknown as Twilio);

  const transport: IEmailTransport = emailTransport ?? getEmailTransport(config);

  const dashboardBaseUrl =
    process.env['BASE_URL'] ?? process.env['WEB_URL'] ?? process.env['NEXT_PUBLIC_APP_URL'] ?? '';
  const emailDelivery = new EmailDelivery(
    {
      fromEmail: sendGridConfig.fromEmail,
      fromName: sendGridConfig.fromName,
      ...(dashboardBaseUrl && { dashboardBaseUrl }),
    },
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

  const agents = [new EmailNotificationAgent(), new ParentEmailNotificationAgent()];

  const dashboardBaseUrlForDigest = dashboardBaseUrl;

  let smsDigestOptions: INotificationServiceSmsDigestOptions | undefined;
  let emailDigestOptions: INotificationServiceEmailDigestOptions | undefined;
  if (database) {
    const userRepo = new UserRepository(database);
    const smsDigestRepo = new SmsDigestPendingRepository(database);
    const emailDigestRepo = new EmailDigestPendingRepository(database);
    smsDigestOptions = {
      getSmsDigestPreference: async (
        userId: string
      ): Promise<{ enabled: true; time?: string } | null> => {
        const user = await userRepo.findById(userId);
        const daily = user?.preferences?.notifications?.digestSchedule?.daily?.enabled === true;
        if (!daily) return null;
        return {
          enabled: true,
          time: user.preferences?.notifications?.digestSchedule?.daily?.time,
        };
      },
      enqueueSmsForDigest: async (
        userId: string,
        phone: string,
        subject: string,
        body: string
      ): Promise<void> => {
        await smsDigestRepo.add({
          userId,
          phone,
          subject,
          body,
          createdAt: new Date(),
        });
      },
    };
    emailDigestOptions = {
      getEmailDigestPreference: async (
        userId: string
      ): Promise<{
        enabled: true;
        time?: string;
        frequency: 'minimal' | 'balanced' | 'proactive';
      } | null> => {
        const user = await userRepo.findById(userId);
        const daily = user?.preferences?.notifications?.digestSchedule?.daily?.enabled === true;
        if (!daily) return null;
        const frequency = user?.preferences?.notifications?.frequency as
          | 'minimal'
          | 'balanced'
          | 'proactive'
          | undefined;
        return {
          enabled: true,
          time: user?.preferences?.notifications?.digestSchedule?.daily?.time,
          frequency: frequency ?? 'balanced',
        };
      },
      enqueueEmailForDigest: async (item: IEmailDigestPendingItem): Promise<void> => {
        await emailDigestRepo.add(item);
      },
      dashboardBaseUrl: dashboardBaseUrlForDigest || undefined,
    };
  }

  return new NotificationService(agents, deliveryRouter, smsDigestOptions, emailDigestOptions);
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

  const sendGridConfig = getSendGridConfig(config);
  const emailTransport = getEmailTransport(config);
  // Initialize notification service (with SMS/email digest when database is available)
  const notificationService = initializeNotificationService(config, database, emailTransport);

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

  const apiBaseUrl = process.env['API_BASE_URL'] ?? process.env['BASE_URL'] ?? '';
  const jwtSecret = process.env['JWT_SECRET'] ?? process.env['CONNECTOR_JWT_SECRET'] ?? '';
  const connectorTokenService = jwtSecret ? new ConnectorTokenService(jwtSecret, '1h') : undefined;
  const createConnectorToken =
    connectorTokenService && apiBaseUrl
      ? (userId: string): string => connectorTokenService.createToken(userId, randomUUID())
      : undefined;

  const syncWorker = new SyncWorker(mongoQueue, database, {
    pollIntervalMs: 5000,
    concurrency: 2,
    decryptCredentials: (encrypted: { encrypted: string; iv: string }): string => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { decryptCredentials } = require('./credentials-cipher');
      return decryptCredentials(encrypted);
    },
    runAdapter: adapterRunner,
    apiBaseUrl: apiBaseUrl || undefined,
    createConnectorToken,
  });
  syncWorker.start();

  const syncScheduler = new SyncScheduler(mongoQueue, database, {
    tickIntervalMs: 60_000,
  });
  syncScheduler.start();

  const twilioConfig = getTwilioConfig(config);
  const twilioClientForDigest =
    twilioConfig.accountSid && twilioConfig.authToken
      ? twilio(twilioConfig.accountSid, twilioConfig.authToken)
      : null;
  if (twilioClientForDigest && twilioConfig.fromNumber) {
    setInterval(() => {
      const now = new Date();
      if (now.getUTCHours() === DIGEST_UTC_HOUR) {
        void flushSmsDigests(database, twilioClientForDigest, twilioConfig.fromNumber).catch((e) =>
          console.error('[SmsDigest]', e)
        );
      }
    }, 60_000);
  }

  const dashboardBaseUrl =
    process.env['BASE_URL'] ?? process.env['WEB_URL'] ?? process.env['NEXT_PUBLIC_APP_URL'] ?? '';

  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const digestInsightService = anthropicApiKey
    ? new DigestInsightService({ llmClient: new LlmClient({ apiKey: anthropicApiKey }) })
    : undefined;

  setInterval(() => {
    void flushEmailDigests(
      database,
      emailTransport,
      sendGridConfig.fromEmail,
      sendGridConfig.fromName,
      dashboardBaseUrl,
      digestInsightService
    ).catch((e) => console.error('[EmailDigest]', e));
  }, 60_000);

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
