import { MongoClient, type Db } from 'mongodb';
import { MongoQueue } from '@scholaracle/agents';
import { NotificationWorker } from '@scholaracle/agents';
import { NotificationService } from '@scholaracle/agents';
import { StudentNotificationGenerator } from '@scholaracle/agents';
import { ParentNotificationGenerator } from '@scholaracle/agents';
import { DeliveryRouter } from '@scholaracle/agents';
import { EmailDelivery } from '@scholaracle/agents';
import { SMSDelivery } from '@scholaracle/agents';
import { PushDelivery } from '@scholaracle/agents';
import { InAppDelivery } from '@scholaracle/agents';
import { messaging, type messaging as MessagingType } from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import type { MailService } from '@sendgrid/mail';
import type { Twilio } from 'twilio';

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
 * Initialize Firebase messaging service.
 *
 * @returns Firebase messaging instance
 */
function initializeFirebaseMessaging(): MessagingType.Messaging {
  try {
    return messaging();
  } catch {
    // Firebase not initialized - create a mock messaging instance
    return {
      send: async () => Promise.resolve('mock-message-id'),
    } as unknown as MessagingType.Messaging;
  }
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

  const sendGrid = sgMail as unknown as MailService;
  const twilioClient =
    twilioConfig.accountSid && twilioConfig.authToken
      ? twilio(twilioConfig.accountSid, twilioConfig.authToken)
      : ({} as unknown as Twilio);

  const emailDelivery = new EmailDelivery(sendGridConfig, sendGrid);
  const smsDelivery = new SMSDelivery(twilioConfig, twilioClient);

  const firebaseProjectId = config.firebaseProjectId ?? 'default';
  const fcmMessaging = initializeFirebaseMessaging();
  const pushDelivery = new PushDelivery({ projectId: firebaseProjectId }, fcmMessaging);
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
  const mongodbUri = config.mongodbUri ?? process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';

  // Connect to MongoDB
  const mongoClient = new MongoClient(mongodbUri);
  await mongoClient.connect();
  const database: Db = mongoClient.db(dbName);

  // Initialize queue
  const mongoQueue = new MongoQueue(database);

  // Initialize notification service
  const notificationService = initializeNotificationService(config);

  // Initialize worker
  const pollIntervalMs = config.pollIntervalMs ?? 1000;
  const concurrency = config.concurrency ?? 10;
  const notificationWorker = new NotificationWorker(mongoQueue, notificationService, {
    pollIntervalMs,
    concurrency,
  });

  // Start worker
  notificationWorker.start();

  // eslint-disable-next-line no-console
  console.log('Notification worker started');

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    // eslint-disable-next-line no-console
    console.log('Shutting down worker...');
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
