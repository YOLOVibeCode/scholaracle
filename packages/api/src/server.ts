import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { healthRouter } from './routes/health';
import { alertsRouter } from './routes/alerts/alerts';
import { authRouter } from './routes/auth/auth';
import { studentsRouter } from './routes/students/students';
import { integrationsRouter } from './routes/integrations/integrations';
import { alertsApiRouter } from './routes/alerts-api/alerts-api';
import { settingsRouter } from './routes/settings/settings';
import { authMiddleware } from './middleware/auth';
import { AuthService, AdminAuthService } from '@scholaracle/auth';
import {
  AdminMFATokenRepository,
  AdminPasswordResetTokenRepository,
  AdminRevokedTokenRepository,
  AdminStepUpChallengeRepository,
  OAuthAccountRepository,
  PasswordResetTokenRepository,
  RefreshTokenRepository,
  SessionRepository,
} from '@scholaracle/database';
import { SendGridPasswordResetEmailSender } from './services/PasswordResetEmailSender';
import { adminAuthRouter } from './routes/admin/auth';
import { customersRouter } from './routes/admin/customers/customers';
import { analyticsRouter } from './routes/admin/analytics';
import { reportsRouter } from './routes/admin/reports';
import { notesRouter } from './routes/admin/notes';
import { subscriptionsRouter } from './routes/admin/subscriptions';
import { paymentsRouter } from './routes/admin/payments';
import { invoicesRouter } from './routes/admin/invoices/invoices';
import { auditLogsRouter } from './routes/admin/audit-logs';
import { communicationsRouter } from './routes/admin/communications';
import { adminUsersRouter } from './routes/admin/users';
import { adminSessionsRouter } from './routes/admin/sessions/sessions';
import { scrapersAdminRouter } from './routes/admin/scrapers/scrapers';
import { communicationsWebhooksRouter } from './routes/webhooks/communications';
import { squareWebhookRouter } from './routes/webhooks/square';
import { billingRouter } from './routes/billing';
import { SquareService } from './services/SquareService';
import { seedRouter } from './routes/seed/seed';
import { ingestV1Router } from './routes/ingest/v1';
import { agendaRouter } from './routes/agenda';
import { sessionsRouter } from './routes/sessions/sessions';
import { NotificationService } from '@scholaracle/agents';
import { StudentNotificationGenerator } from '@scholaracle/agents';
import { ParentNotificationGenerator } from '@scholaracle/agents';
import { DeliveryRouter } from '@scholaracle/agents';
import { EmailDelivery } from '@scholaracle/agents';
import { SMSDelivery } from '@scholaracle/agents';
import { PushDelivery } from '@scholaracle/agents';
import { InAppDelivery } from '@scholaracle/agents';
import type { MailService } from '@sendgrid/mail';
import type { Twilio } from 'twilio';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';

export interface IServerConfig {
  readonly port?: number;
  readonly mongodbUri?: string;
  readonly mongodbDbName?: string;
  readonly jwtSecret?: string;
  readonly baseUrl?: string;
  readonly sendGridApiKey?: string;
  readonly sendGridFromEmail?: string;
  readonly sendGridFromName?: string;
  readonly twilioAccountSid?: string;
  readonly twilioAuthToken?: string;
  readonly twilioFromNumber?: string;
  readonly squareAccessToken?: string;
  readonly squareEnvironment?: 'sandbox' | 'production';
  readonly squareLocationId?: string;
  readonly squareWebhookSignatureKey?: string;
  readonly squareWebhookNotificationUrl?: string;
}

/**
 * Error handling middleware.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function errorHandler(error: Error, _req: Request, res: Response, _next: NextFunction): void {
  // eslint-disable-next-line no-console
  console.error('Error:', error);

  res.status(500).json({
    success: false,
    error: error.message ?? 'Internal server error',
  });
}

/**
 * Get SendGrid configuration from config or environment.
 *
 * @param config - Server configuration
 * @returns SendGrid configuration
 */
function getSendGridConfig(config: IServerConfig): {
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
 * @param config - Server configuration
 * @returns Twilio configuration
 */
function getTwilioConfig(config: IServerConfig): {
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
 * @param config - Server configuration
 * @returns Notification service instance
 */
function initializeNotificationService(config: IServerConfig): NotificationService {
  const sendGridConfig = getSendGridConfig(config);
  const twilioConfig = getTwilioConfig(config);

  const sendGrid = sgMail as unknown as MailService;
  const twilioClient =
    twilioConfig.accountSid && twilioConfig.authToken
      ? twilio(twilioConfig.accountSid, twilioConfig.authToken)
      : ({} as unknown as Twilio);

  const emailDelivery = new EmailDelivery(sendGridConfig, sendGrid);
  const smsDelivery = new SMSDelivery(twilioConfig, twilioClient);
  const pushDelivery = new PushDelivery({ projectId: 'test-project' });
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
 * Initialize MongoDB connection.
 *
 * @param config - Server configuration
 * @returns MongoDB database instance
 */
async function initializeDatabase(config: IServerConfig): Promise<Db> {
  const mongodbUri =
    config.mongodbUri ??
    process.env['MONGODB_URI'] ??
    process.env['MONGO_URL'] ??
    'mongodb://localhost:27017';
  const dbName = config.mongodbDbName ?? process.env['MONGODB_DB_NAME'] ?? 'scholaracle';

  // Allow fully self-contained E2E runs without an external MongoDB daemon.
  // Usage: MONGODB_URI=memory MONGODB_DB_NAME=scholaracle_e2e
  if (
    mongodbUri === 'memory' ||
    mongodbUri.startsWith('memory:') ||
    process.env['USE_IN_MEMORY_MONGO'] === 'true'
  ) {
    const memoryServer = await MongoMemoryServer.create();
    const uri = memoryServer.getUri();
    const client = new MongoClient(uri);
    await client.connect();
    return client.db(dbName);
  }

  const client = new MongoClient(mongodbUri);
  await client.connect();

  return client.db(dbName);
}

/**
 * Create Express application with all routes configured.
 *
 * @param config - Server configuration
 * @param database - MongoDB database instance
 * @returns Express application
 */
export function createApp(config: IServerConfig = {}, database?: Db): Express {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS - restrict origins in production
  const allowedOrigins = process.env['CORS_ORIGINS']
    ? process.env['CORS_ORIGINS'].split(',')
    : ['http://localhost:2800', 'http://localhost:3000'];
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );

  // Cookie parsing (for refresh_token httpOnly cookie)
  app.use(cookieParser());

  // Body parsing with size limit
  app.use(express.json({ limit: '10mb' }));

  // Resolve JWT secret once - fail hard in production if missing
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const jwtSecret =
    config.jwtSecret ??
    process.env['JWT_SECRET'] ??
    (nodeEnv === 'production' ? undefined : 'test-secret');
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  const notificationService = initializeNotificationService(config);

  app.use('/api/health', healthRouter);

  // Seed endpoint (development/test only)
  if (database) {
    app.use('/api/seed', seedRouter({ database, jwtSecret }));
  }

  // Legacy alerts route (for notification creation) - POST /api/alerts
  app.use('/api/alerts', alertsRouter(notificationService));

  if (database) {
    const baseUrl =
      config.baseUrl ??
      process.env['BASE_URL'] ??
      process.env['WEB_URL'] ??
      'http://localhost:2800';
    const passwordResetTokenStore = new PasswordResetTokenRepository(database);
    const refreshTokenStore = new RefreshTokenRepository(database);
    const sessionRepository = new SessionRepository(database);
    const oauthAccountRepository = new OAuthAccountRepository(database);
    const sendGridConfig = getSendGridConfig(config);
    const sendGrid = sgMail as unknown as MailService;
    const passwordResetEmailSender = new SendGridPasswordResetEmailSender(sendGridConfig, sendGrid);

    const authService = new AuthService(
      database,
      jwtSecret,
      process.env['JWT_ACCESS_EXPIRES_IN'] ?? process.env['JWT_EXPIRES_IN'] ?? '15m',
      passwordResetTokenStore,
      passwordResetEmailSender,
      baseUrl,
      refreshTokenStore,
      process.env['REFRESH_TOKEN_EXPIRES_IN'] ?? '30d',
      process.env['SESSION_REFRESH_TOKEN_EXPIRES_IN'] ?? '24h',
      oauthAccountRepository
    );

    // User-facing API routes
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret,
        jwtExpiresIn:
          process.env['JWT_ACCESS_EXPIRES_IN'] ?? process.env['JWT_EXPIRES_IN'] ?? '15m',
        passwordResetTokenStore,
        passwordResetEmailSender,
        baseUrl,
        refreshTokenStore,
        refreshTokenExpiresIn: process.env['REFRESH_TOKEN_EXPIRES_IN'] ?? '30d',
        sessionRefreshTokenExpiresIn: process.env['SESSION_REFRESH_TOKEN_EXPIRES_IN'] ?? '24h',
        sessionRepository,
        oauthAccountRepository,
        authService,
      })
    );
    app.use('/api/sessions', sessionsRouter({ database, authService }));
    app.use('/api/students', authMiddleware(authService), studentsRouter({ database }));
    app.use('/api/integrations', authMiddleware(authService), integrationsRouter({ database }));
    // New alerts API routes (for fetching/managing alerts) - GET/POST/DELETE /api/alerts-api
    app.use('/api/alerts-api', authMiddleware(authService), alertsApiRouter({ database }));
    // Settings API routes
    app.use(
      '/api/settings',
      authMiddleware(authService),
      settingsRouter({ database, authService })
    );
    // Agenda API routes (unified assignments + recurring events)
    app.use('/api/agenda', agendaRouter({ database, notificationService }));
    // SLC ingestion (device auth is public; approval uses user JWT; ingestion uses connector JWT)
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret }));

    // Admin API routes (separate authentication)
    const adminRevokedTokenStore = new AdminRevokedTokenRepository(database);
    const adminMfaTokenStore = new AdminMFATokenRepository(database);
    const adminStepUpChallengeStore = new AdminStepUpChallengeRepository(database);
    const adminPasswordResetTokenStore = new AdminPasswordResetTokenRepository(database);
    const adminAuthService = new AdminAuthService(
      database,
      jwtSecret,
      undefined,
      undefined,
      adminRevokedTokenStore,
      adminMfaTokenStore,
      adminPasswordResetTokenStore,
      passwordResetEmailSender,
      baseUrl
    );
    app.use(
      '/api/admin/auth',
      adminAuthRouter({
        database,
        jwtSecret,
        revokedTokenStore: adminRevokedTokenStore,
        mfaTokenStore: adminMfaTokenStore,
        stepUpChallengeStore: adminStepUpChallengeStore,
        adminPasswordResetTokenStore,
        adminPasswordResetEmailSender: passwordResetEmailSender,
        adminBaseUrl: baseUrl,
        sessionRepository,
      })
    );
    app.use(
      '/api/admin/sessions',
      adminSessionsRouter({
        database,
        adminAuthService,
        adminJwtSecret: jwtSecret ?? process.env['JWT_SECRET'] ?? '',
      })
    );
    app.use('/api/admin/customers', customersRouter({ database }));
    app.use('/api/admin/subscriptions', subscriptionsRouter({ database }));
    app.use('/api/admin/payments', paymentsRouter({ database }));
    app.use('/api/admin/invoices', invoicesRouter({ database, jwtSecret }));
    app.use('/api/admin/audit-logs', auditLogsRouter({ database, jwtSecret }));
    app.use('/api/admin/communications', communicationsRouter({ database, jwtSecret }));
    app.use('/api/admin/users', adminUsersRouter({ database, jwtSecret }));
    app.use('/api/admin/analytics', analyticsRouter({ database }));
    app.use('/api/admin/scrapers', scrapersAdminRouter({ database }));
    app.use('/api/admin/reports', reportsRouter({ database }));
    app.use('/api/admin', notesRouter({ database }));

    // Webhook ingestion (delivery tracking)
    app.use('/api/webhooks/communications', communicationsWebhooksRouter({ database }));

    // Square billing (optional — only registers if access token and location are configured)
    const squareAccessToken = config.squareAccessToken ?? process.env['SQUARE_ACCESS_TOKEN'];
    const squareLocationId = config.squareLocationId ?? process.env['SQUARE_LOCATION_ID'];
    const squareEnv = (config.squareEnvironment ??
      process.env['SQUARE_ENVIRONMENT'] ??
      'sandbox') as 'sandbox' | 'production';
    const squareWebhookKey =
      config.squareWebhookSignatureKey ?? process.env['SQUARE_WEBHOOK_SIGNATURE_KEY'];
    const squareWebhookUrl =
      config.squareWebhookNotificationUrl ?? process.env['SQUARE_WEBHOOK_NOTIFICATION_URL'];

    if (squareAccessToken && squareLocationId) {
      const squareService = new SquareService({
        accessToken: squareAccessToken,
        environment: squareEnv,
        locationId: squareLocationId,
        webhookSignatureKey: squareWebhookKey,
        webhookNotificationUrl: squareWebhookUrl,
      });

      app.use(
        '/api/billing',
        authMiddleware(authService),
        billingRouter({ database, squareService })
      );
      // Square webhook uses raw body for signature verification
      app.use(
        '/api/webhooks/square',
        express.raw({ type: 'application/json' }),
        (req: Request, _res: Response, next: NextFunction) => {
          if (Buffer.isBuffer(req.body)) {
            (req as unknown as { body: string }).body = req.body.toString('utf8');
          }
          next();
        },
        squareWebhookRouter({ database, squareService })
      );
    }
  }

  app.use(errorHandler);

  return app;
}

/**
 * Start the server.
 *
 * @param config - Server configuration
 */
export async function startServer(config: IServerConfig = {}): Promise<void> {
  const database = await initializeDatabase(config);
  const app = createApp(config, database);
  const port = config.port ?? parseInt(process.env['PORT'] ?? '3000', 10);

  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on port ${port}`);
  });
}

// Start server if this file is run directly
if (require.main === module) {
  startServer().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
