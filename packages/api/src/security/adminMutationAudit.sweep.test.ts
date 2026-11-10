import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { adminAuthRouter } from '../routes/admin/auth/auth';
import { customersRouter } from '../routes/admin/customers/customers';
import { adminUsersRouter } from '../routes/admin/users/users';
import { couponsRouter } from '../routes/admin/coupons/coupons';
import { paymentsRouter } from '../routes/admin/payments/payments';
import { subscriptionsRouter } from '../routes/admin/subscriptions/subscriptions';
import { communicationsRouter } from '../routes/admin/communications/communications';
import { auditLogsRouter } from '../routes/admin/audit-logs/audit-logs';
import {
  AdminStepUpChallengeRepository,
  PasswordResetTokenRepository,
} from '@scholaracle/database';
import { AuthService } from '@scholaracle/auth';
import { createErrorHandler } from '../middleware/errorHandler';
import { createTestAdmin } from '../test-utils/admin-test-helper';
import type { INoctusoftStoreClient } from '../services/noctusoft-store/NoctusoftStoreClient';
import { collectAdminMutationAuditActions } from './adminAuditActionSource';
import {
  buildAdminMutationAuditRunners,
  type IAdminAuditSweepContext,
} from './adminMutationAuditRunners';

const noOpPasswordResetSender = { sendResetLink: async (): Promise<void> => {} };

describe('Admin mutation audit sweep', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  let ctx: IAdminAuditSweepContext;
  const discoveredActions = collectAdminMutationAuditActions();
  const runners = buildAdminMutationAuditRunners();

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('admin-audit-sweep');

    const storeClient: jest.Mocked<INoctusoftStoreClient> = {
      createCheckout: jest.fn(),
      cancelSubscription: jest.fn(),
      updatePaymentMethod: jest.fn(),
      refundPayment: jest.fn(),
    };

    const adminResult = await createTestAdmin(database, 'test-secret', {
      email: 'audit-sweep-admin@test.com',
      password: 'AdminPass123!',
      name: 'Audit Sweep Admin',
      role: 'admin',
    });

    app = express();
    app.use(express.json());
    app.use(
      '/api/admin/auth',
      adminAuthRouter({
        database,
        jwtSecret: 'test-secret',
        stepUpChallengeStore: new AdminStepUpChallengeRepository(database),
      })
    );
    const passwordResetTokenStore = new PasswordResetTokenRepository(database);
    const authServiceForReset = new AuthService(
      database,
      'test-secret',
      '15m',
      passwordResetTokenStore,
      noOpPasswordResetSender,
      'http://localhost:2800'
    );
    app.use(
      '/api/admin/customers',
      customersRouter({
        database,
        jwtSecret: 'test-secret',
        authService: authServiceForReset,
        baseUrl: 'https://test.example.com',
      })
    );
    app.use('/api/admin/users', adminUsersRouter({ database, jwtSecret: 'test-secret' }));
    app.use('/api/admin/coupons', couponsRouter({ database, jwtSecret: 'test-secret' }));
    app.use(
      '/api/admin/payments',
      paymentsRouter({ database, jwtSecret: 'test-secret', storeClient })
    );
    app.use(
      '/api/admin/subscriptions',
      subscriptionsRouter({ database, jwtSecret: 'test-secret' })
    );
    app.use(
      '/api/admin/communications',
      communicationsRouter({ database, jwtSecret: 'test-secret' })
    );
    app.use('/api/admin/audit-logs', auditLogsRouter({ database, jwtSecret: 'test-secret' }));
    app.use(createErrorHandler());

    ctx = {
      app,
      database,
      adminToken: adminResult.token,
      adminMfaSecret: adminResult.mfaSecret,
      adminEmail: adminResult.admin.email,
      storeClient,
    };
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it('registers a sweep runner for every audited admin mutation action', () => {
    const missing = discoveredActions.filter((action) => runners[action] === undefined);
    expect(missing).toEqual([]);
  });

  it.each(discoveredActions)(
    'admin mutation %s writes an audit log row',
    async (expectedAction) => {
      const runner = runners[expectedAction];
      if (!runner) {
        throw new Error(`Missing runner for ${expectedAction}`);
      }
      await database.collection('audit_logs').deleteMany({});
      await runner(ctx);
      const logs = await database
        .collection('audit_logs')
        .find({ action: expectedAction })
        .toArray();
      expect(logs.length).toBeGreaterThan(0);
    },
    60_000
  );
});
