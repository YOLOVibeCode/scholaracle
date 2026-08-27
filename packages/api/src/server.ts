import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { healthRouter } from './routes/health';
import { alertsRouter } from './routes/alerts/alerts';
import { authRouter } from './routes/auth/auth';
import { cliAuthRouter } from './routes/auth/cli-auth';
import { studentsRouter } from './routes/students/students';
import { integrationsRouter } from './routes/integrations/integrations';
import { alertsApiRouter } from './routes/alerts-api/alerts-api';
import { emailHistoryRouter } from './routes/email-history/email-history';
import { settingsRouter } from './routes/settings/settings';
import { authMiddleware } from './middleware/auth';
import { requireParent, requireStudent } from './middleware/requireRole';
import { studioRouter } from './routes/studio/studio';
import { requestIdMiddleware } from './middleware/requestId';
import { createErrorHandler, notFoundHandler } from './middleware/errorHandler';
import { installProcessHandlers } from './utils/processHandlers';
import { initSentry } from './sentry';
import { logger } from './logger';
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
  StudentRepository,
  SourceInviteRepository,
} from '@scholaracle/database';
import { SendGridPasswordResetEmailSender } from './services/PasswordResetEmailSender';
import { SendGridInviteEmailSender } from './services/InviteEmailSender';
import { MagicLinkSender } from './services/provision/MagicLinkSender';
import { SendGridPasswordChangedEmailSender } from './services/PasswordChangedEmailSender';
import { SendGridSourceInviteEmailSender } from './services/source-invite/SourceInviteEmailSender';
import { SourceInviteService } from './services/source-invite/SourceInviteService';
import { StudentRepositoryOwnerLookup } from './services/source-invite/studentOwnerLookup';
import { SystemClock } from './services/source-invite/clock';
import { CryptoTokenGenerator, Sha256TokenHasher } from './services/source-invite/tokens';
import { InstallLandingRenderer } from './services/source-invite/InstallLandingRenderer';
import { installSourceRouter, sourceInvitesRouter } from './routes/source-invites/source-invites';
import { MemoryRateLimiter } from './middleware/rateLimit';
import { resolveApiBaseUrl } from './routes/students/attachmentSigning';
import { adminAuthRouter } from './routes/admin/auth';
import { customersRouter } from './routes/admin/customers/customers';
import { analyticsRouter } from './routes/admin/analytics';
import { reportsRouter } from './routes/admin/reports';
import { notesRouter } from './routes/admin/notes';
import { subscriptionsRouter } from './routes/admin/subscriptions';
import { paymentsRouter } from './routes/admin/payments';
import { couponsRouter } from './routes/admin/coupons';
import { invoicesRouter } from './routes/admin/invoices/invoices';
import { auditLogsRouter } from './routes/admin/audit-logs';
import { communicationsRouter } from './routes/admin/communications';
import { adminUsersRouter } from './routes/admin/users';
import { adminSessionsRouter } from './routes/admin/sessions/sessions';
import { scrapersAdminRouter } from './routes/admin/scrapers/scrapers';
import { createScrapersRouter } from './routes/scrapers/scrapers';
import { createDiagnosticsRouter } from './routes/admin/diagnostics';
import { communicationsWebhooksRouter } from './routes/webhooks/communications';
import { squareWebhookRouter } from './routes/webhooks/square';
import { twilioWebhookRouter } from './routes/webhooks/twilio';
import { billingRouter } from './routes/billing';
import { SquareService } from './services/SquareService';
import { seedRouter } from './routes/seed/seed';
import { createAccountRouter } from './routes/account/account';
import { ingestV1Router } from './routes/ingest/v1';
import { createGoogleOAuthRouter } from './routes/oauth/google';
import { createAssetUploadRouter, createAssetServeRouter } from './routes/assets/assets';
import { createAssetStore } from './services/assets/createAssetStore';
import { agendaRouter } from './routes/agenda';
import { sessionsRouter } from './routes/sessions/sessions';
import {
  NotificationService,
  StudentNotificationGenerator,
  ParentNotificationGenerator,
  DeliveryRouter,
  EmailDelivery,
  SendGridTransport,
  SmtpTransport,
  MongoQueue,
} from '@scholaracle/agents';
import { SMSDelivery, applyTwilioApiBaseUrl } from '@scholaracle/agents';
import type { INotificationDelivery } from '@scholaracle/interfaces';
import type { MailService } from '@sendgrid/mail';
import type { Twilio } from 'twilio';
import type { IEmailTransport } from '@scholaracle/agents';
import sgMail from '@sendgrid/mail';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

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
  readonly twilioApiKeySid?: string;
  readonly twilioApiKeySecret?: string;
  readonly twilioFromNumber?: string;
  readonly twilioMessagingServiceSid?: string;
  readonly squareAccessToken?: string;
  readonly squareEnvironment?: 'sandbox' | 'production';
  readonly squareLocationId?: string;
  readonly squareWebhookSignatureKey?: string;
  readonly squareWebhookNotificationUrl?: string;
  /** Optional Square API host override (e.g. Noctusoft relay). */
  readonly squareBaseUrl?: string;
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
      'notifications@scholarmancy.com',
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
  readonly apiKeySid: string;
  readonly apiKeySecret: string;
  readonly fromNumber: string;
  readonly messagingServiceSid: string;
} {
  return {
    accountSid: config.twilioAccountSid ?? process.env['TWILIO_ACCOUNT_SID'] ?? '',
    authToken: config.twilioAuthToken ?? process.env['TWILIO_AUTH_TOKEN'] ?? '',
    apiKeySid: config.twilioApiKeySid ?? process.env['TWILIO_API_KEY_SID'] ?? '',
    apiKeySecret: config.twilioApiKeySecret ?? process.env['TWILIO_API_KEY_SECRET'] ?? '',
    fromNumber: config.twilioFromNumber ?? process.env['TWILIO_FROM_NUMBER'] ?? '',
    messagingServiceSid:
      config.twilioMessagingServiceSid ?? process.env['TWILIO_MESSAGING_SERVICE_SID'] ?? '',
  };
}

/**
 * Initialize notification service with delivery services.
 *
 * @param config - Server configuration
 * @returns Notification service and email infrastructure
 */
function initializeNotificationService(config: IServerConfig): {
  notificationService: NotificationService;
  emailTransport: IEmailTransport;
  fromEmail: string;
  fromName: string;
  twilioClient: import('twilio').Twilio | null;
  twilioFromNumber: string;
  twilioMessagingServiceSid: string;
} {
  const sendGridConfig = getSendGridConfig(config);
  const twilioConfig = getTwilioConfig(config);

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
    : new SendGridTransport(
        sendGridConfig.apiKey,
        sgMail as unknown as MailService,
        process.env['SENDGRID_BASE_URL']
      );

  const dashboardBaseUrl =
    process.env['BASE_URL'] ?? process.env['WEB_URL'] ?? process.env['NEXT_PUBLIC_APP_URL'] ?? '';
  const emailDelivery = new EmailDelivery(
    {
      fromEmail: sendGridConfig.fromEmail,
      fromName: sendGridConfig.fromName,
      replyTo: process.env['SENDGRID_REPLY_TO'],
      ...(dashboardBaseUrl && { dashboardBaseUrl }),
    },
    transport
  );
  const hasApiKeyAuth = Boolean(
    twilioConfig.accountSid && twilioConfig.apiKeySid && twilioConfig.apiKeySecret
  );
  const hasAuthTokenAuth = Boolean(twilioConfig.accountSid && twilioConfig.authToken);
  const twilioConfigured =
    (hasApiKeyAuth || hasAuthTokenAuth) &&
    Boolean(twilioConfig.fromNumber || twilioConfig.messagingServiceSid);
  const twilioClient = twilioConfigured
    ? applyTwilioApiBaseUrl(
        hasApiKeyAuth
          ? twilio(twilioConfig.apiKeySid, twilioConfig.apiKeySecret, {
              accountSid: twilioConfig.accountSid,
            })
          : twilio(twilioConfig.accountSid, twilioConfig.authToken),
        process.env['TWILIO_API_BASE_URL']
      )
    : ({} as unknown as Twilio);
  const smsDelivery = new SMSDelivery(
    {
      accountSid: twilioConfig.accountSid,
      authToken: twilioConfig.authToken,
      fromNumber: twilioConfig.fromNumber,
      messagingServiceSid: twilioConfig.messagingServiceSid,
    },
    twilioClient
  );

  const deliveryServices: readonly INotificationDelivery[] = [
    emailDelivery,
    ...(twilioConfigured ? [smsDelivery] : []),
    // Push and InApp are optional; omit when not configured to avoid delivery errors.
  ];
  const deliveryRouter = new DeliveryRouter(deliveryServices);

  const studentGenerator = new StudentNotificationGenerator();
  const parentGenerator = new ParentNotificationGenerator();

  return {
    notificationService: new NotificationService(studentGenerator, parentGenerator, deliveryRouter),
    emailTransport: transport,
    fromEmail: sendGridConfig.fromEmail,
    fromName: sendGridConfig.fromName,
    twilioClient: twilioConfigured ? twilioClient : null,
    twilioFromNumber: twilioConfig.fromNumber,
    twilioMessagingServiceSid: twilioConfig.messagingServiceSid,
  };
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
// eslint-disable-next-line complexity
export function createApp(config: IServerConfig = {}, database?: Db): Express {
  const app = express();

  // Correlation ID first: every request gets an x-request-id bound to the
  // async context so all log lines and error responses can be tied together.
  app.use(requestIdMiddleware);

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

  // Body parsing with size limit. The Square webhook route is excluded: it
  // needs the raw request body for HMAC signature verification, and a global
  // express.json() would consume the stream before the route-level
  // express.raw() ever sees it (body-parser skips once req._body is set).
  const jsonParser = express.json({ limit: '10mb' });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/webhooks/square') {
      next();
      return;
    }
    jsonParser(req, res, next);
  });

  // Resolve JWT secret once - fail hard in production if missing
  const nodeEnv = process.env['NODE_ENV'] ?? 'development';
  const jwtSecret =
    config.jwtSecret ??
    process.env['JWT_SECRET'] ??
    (nodeEnv === 'production' ? undefined : 'test-secret');
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  const notificationInit = initializeNotificationService(config);
  const { notificationService, emailTransport, fromEmail, fromName } = notificationInit;

  app.use('/api/health', healthRouter);

  // Seed endpoint (development/test only)
  if (database) {
    app.use('/api/seed', seedRouter({ database, jwtSecret, assetStore: createAssetStore() }));
  }

  // Legacy alerts route (for notification creation) - POST /api/alerts.
  // Mounted below inside the `if (database)` block so authMiddleware + IStudentReader
  // ownership check (DEF-003) can be applied. When database is unavailable the route
  // is intentionally not exposed.
  const notificationQueue = database ? new MongoQueue(database) : undefined;

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
    if (nodeEnv === 'production' && !sendGridConfig.apiKey) {
      throw new Error(
        'SENDGRID_API_KEY environment variable is required in production for invite and password reset emails'
      );
    }
    const sendGrid = sgMail as unknown as MailService;
    const passwordResetEmailSender = new SendGridPasswordResetEmailSender(sendGridConfig, sendGrid);
    const inviteEmailSender = new SendGridInviteEmailSender(sendGridConfig, sendGrid);
    const passwordChangedEmailSender = new SendGridPasswordChangedEmailSender(
      sendGridConfig,
      sendGrid
    );

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
    app.use('/api/auth/cli', cliAuthRouter({ database, authService, baseUrl }));
    app.use('/api/sessions', sessionsRouter({ database, authService }));

    // Create SyncScheduler once (if available) to be shared by students and sync routes
    let syncScheduler: import('@scholaracle/agents').SyncScheduler | undefined;
    try {
      const { MongoQueue, SyncScheduler } = require('@scholaracle/agents');
      const syncQueue = new MongoQueue(database);
      syncScheduler = new SyncScheduler(syncQueue, database);
    } catch {
      // Agents package not available — sync routes will be skipped
    }

    const {
      emailTransport: magicEmailTransport,
      fromEmail: magicFromEmail,
      fromName: magicFromName,
      twilioClient: magicTwilioClient,
      twilioFromNumber,
      twilioMessagingServiceSid,
    } = notificationInit;
    const magicLinkSender = new MagicLinkSender(
      magicEmailTransport,
      { fromEmail: magicFromEmail, fromName: magicFromName },
      magicTwilioClient,
      { fromNumber: twilioFromNumber, messagingServiceSid: twilioMessagingServiceSid }
    );

    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({
        database,
        baseUrl: baseUrl ?? '',
        jwtSecret,
        sendInviteEmail: inviteEmailSender,
        syncScheduler,
        magicLinkSender,
      })
    );
    app.use(
      '/api/studio',
      authMiddleware(authService),
      requireStudent,
      studioRouter({
        database,
        baseUrl: baseUrl ?? '',
        jwtSecret,
      })
    );
    app.use(
      '/api/integrations',
      authMiddleware(authService),
      requireParent,
      integrationsRouter({ database })
    );
    // Account routes (push tokens for parent and student logins, email transfer).
    // Push registration is any authenticated user; household email transfer is
    // requireParent inside the router.
    app.use(
      '/api/account',
      authMiddleware(authService),
      createAccountRouter({ database, baseUrl })
    );
    app.use(
      '/api/scrapers',
      createScrapersRouter({
        database,
        publisherUserIds: process.env['SCRAPER_PUBLISHER_USER_IDS']?.split(',').filter(Boolean),
      })
    );

    app.use(
      '/api/oauth',
      createGoogleOAuthRouter({
        database,
        jwtSecret: jwtSecret ?? '',
        baseUrl,
        authService,
      })
    );

    // Sync API — trigger and monitor data-source sync jobs (uses syncScheduler created above)
    if (syncScheduler) {
      try {
        const { createSyncRouter } = require('./routes/sync/sync');
        app.use(
          '/api/sync',
          authMiddleware(authService),
          requireParent,
          createSyncRouter({ database, syncScheduler })
        );
      } catch {
        // Sync route not available — skip /api/sync
      }
    }

    // Legacy alerts route (for notification creation) - POST /api/alerts.
    // Auth + ownership-checked per DEF-003.
    app.use(
      '/api/alerts',
      authMiddleware(authService),
      requireParent,
      alertsRouter(notificationService, {
        queue: notificationQueue,
        studentReader: new StudentRepository(database),
      })
    );

    // New alerts API routes (for fetching/managing alerts) - GET/POST/DELETE /api/alerts-api
    app.use(
      '/api/alerts-api',
      authMiddleware(authService),
      requireParent,
      alertsApiRouter({ database })
    );
    // Email history API routes
    app.use(
      '/api/email-history',
      authMiddleware(authService),
      requireParent,
      emailHistoryRouter({
        database,
        transport: emailTransport,
        fromEmail,
        fromName,
      })
    );
    // Settings API routes
    app.use(
      '/api/settings',
      authMiddleware(authService),
      requireParent,
      settingsRouter({ database, authService })
    );
    // Agenda API routes (unified assignments + recurring events)
    app.use('/api/agenda', agendaRouter({ database, notificationService }));
    // SLC ingestion (device auth is public; approval uses user JWT; ingestion uses connector JWT)
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret, queue: notificationQueue }));

    const sourceInviteStore = new SourceInviteRepository(database);
    const sourceInviteService = new SourceInviteService(
      sourceInviteStore,
      new SystemClock(),
      new CryptoTokenGenerator(),
      new Sha256TokenHasher(),
      new StudentRepositoryOwnerLookup(new StudentRepository(database))
    );
    const sourceInviteMailer = new SendGridSourceInviteEmailSender(sendGridConfig, sendGrid);
    const sourceInviteConfig = {
      issuer: sourceInviteService,
      redeemer: sourceInviteService,
      mailer: sourceInviteMailer,
      landing: new InstallLandingRenderer(),
      apiPublicOrigin: resolveApiBaseUrl(baseUrl) || baseUrl,
      webOrigin: baseUrl,
      limiter: new MemoryRateLimiter(),
    };
    app.use(
      '/api/source-invites',
      authMiddleware(authService),
      requireParent,
      sourceInvitesRouter(sourceInviteConfig)
    );
    app.use('/install-source', installSourceRouter(sourceInviteConfig));

    // Asset upload (connector auth) — mount under ingest path. ASSET_STORE=local|s3; S3 uses Railway Buckets or R2/B2.
    const assetStore = createAssetStore();
    const assetBaseUrl =
      process.env['ASSET_BASE_URL'] ??
      (process.env['RAILWAY_PUBLIC_DOMAIN']
        ? `https://${process.env['RAILWAY_PUBLIC_DOMAIN']}`
        : baseUrl);
    const assetsConfig = {
      database,
      jwtSecret: jwtSecret ?? '',
      assetStore,
      baseUrl: assetBaseUrl,
      authService,
    };
    app.use('/api/ingest/v1/assets', createAssetUploadRouter(assetsConfig));
    app.use('/api/assets', createAssetServeRouter(assetsConfig));

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
    app.use(
      '/api/admin/customers',
      customersRouter({
        database,
        jwtSecret,
        authService,
        passwordChangedEmailSender,
        baseUrl,
      })
    );
    // Square service (optional — created early so admin payments can use it for refunds)
    const squareAccessToken = config.squareAccessToken ?? process.env['SQUARE_ACCESS_TOKEN'];
    const squareLocationId = config.squareLocationId ?? process.env['SQUARE_LOCATION_ID'];
    const squareEnv = (config.squareEnvironment ??
      process.env['SQUARE_ENVIRONMENT'] ??
      'sandbox') as 'sandbox' | 'production';
    const squareWebhookKey =
      config.squareWebhookSignatureKey ?? process.env['SQUARE_WEBHOOK_SIGNATURE_KEY'];
    const squareWebhookUrl =
      config.squareWebhookNotificationUrl ?? process.env['SQUARE_WEBHOOK_NOTIFICATION_URL'];
    const squareBaseUrl = config.squareBaseUrl ?? process.env['SQUARE_BASE_URL'];

    const squareService =
      squareAccessToken && squareLocationId
        ? new SquareService({
            accessToken: squareAccessToken,
            environment: squareEnv,
            locationId: squareLocationId,
            webhookSignatureKey: squareWebhookKey,
            webhookNotificationUrl: squareWebhookUrl,
            ...(squareBaseUrl ? { baseUrl: squareBaseUrl } : {}),
          })
        : undefined;

    app.use('/api/admin/subscriptions', subscriptionsRouter({ database }));
    app.use('/api/admin/payments', paymentsRouter({ database, squareService }));
    app.use('/api/admin/coupons', couponsRouter({ database }));
    app.use('/api/admin/invoices', invoicesRouter({ database, jwtSecret }));
    app.use('/api/admin/audit-logs', auditLogsRouter({ database, jwtSecret }));
    app.use('/api/admin/communications', communicationsRouter({ database, jwtSecret }));
    app.use('/api/admin/users', adminUsersRouter({ database, jwtSecret }));
    app.use('/api/admin/analytics', analyticsRouter({ database }));
    app.use('/api/admin/scrapers', scrapersAdminRouter({ database }));
    app.use('/api/admin/reports', reportsRouter({ database }));
    app.use('/api/admin/diagnostics', createDiagnosticsRouter({ database }));
    app.use('/api/admin', notesRouter({ database }));

    // Webhook ingestion (delivery tracking)
    app.use('/api/webhooks/communications', communicationsWebhooksRouter({ database }));

    // Twilio webhooks (inbound SMS, delivery status callbacks)
    const twilioAuthToken = config.twilioAuthToken ?? process.env['TWILIO_AUTH_TOKEN'] ?? '';
    app.use('/api/webhooks/twilio', twilioWebhookRouter({ database, twilioAuthToken }));

    if (squareService) {
      app.use(
        '/api/billing',
        authMiddleware(authService),
        requireParent,
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

  // Unknown routes get the standard JSON envelope; the error handler is last.
  app.use(notFoundHandler);
  app.use(createErrorHandler());

  return app;
}

/**
 * Start the server.
 *
 * @param config - Server configuration
 */
export async function startServer(config: IServerConfig = {}): Promise<void> {
  initSentry();
  installProcessHandlers(logger);

  const database = await initializeDatabase(config);
  const app = createApp(config, database);
  const port = config.port ?? parseInt(process.env['PORT'] ?? '3000', 10);

  const server = app.listen(port, () => {
    logger.info({ port }, 'server running');
  });

  // Graceful shutdown: stop accepting connections, then exit. Railway sends
  // SIGTERM on redeploys; in-flight requests get a chance to finish.
  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close(() => {
      process.exit(0);
    });
    // Force-exit if connections refuse to drain.
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start server if this file is run directly
if (require.main === module) {
  startServer().catch((error: unknown) => {
    logger.fatal({ err: error }, 'failed to start server');
    process.exit(1);
  });
}
