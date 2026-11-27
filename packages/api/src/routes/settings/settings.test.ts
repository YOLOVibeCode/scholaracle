import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { SCHOLARMANCY_SMS_PURPOSE, type ISmsConsentRecord } from '@scholaracle/contracts';
import { SmsConsentRepository, UserRepository } from '@scholaracle/database';
import { AuthService } from '@scholaracle/auth';
import { settingsRouter } from './settings';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('Settings API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let testToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Connect to test database
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    try {
      mongoClient = new MongoClient(mongodbUri);
      await mongoClient.connect();
      database = mongoClient.db(dbName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('MongoDB not available, skipping integration tests');
      return;
    }

    // Clean up any existing test users
    await database.collection('users').deleteMany({ email: 'settings@example.com' });

    // Create test user and get token
    authService = new AuthService(database);
    const registerResult = await authService.register(
      'settings@example.com',
      'password123',
      'Settings User'
    );
    if (registerResult.success && registerResult.user && registerResult.token) {
      testUserId = registerResult.user.id;
      testToken = registerResult.token;
    } else {
      // Try login if registration failed (user might already exist)
      const loginResult = await authService.login('settings@example.com', 'password123');
      if (loginResult.success && loginResult.user && loginResult.token) {
        testUserId = loginResult.user.id;
        testToken = loginResult.token;
      } else {
        throw new Error(
          `Failed to authenticate test user: ${registerResult.error ?? loginResult.error ?? 'Unknown error'}`
        );
      }
    }

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/settings', authMiddleware(authService), settingsRouter({ database }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    // Reset user settings before each test
    if (database && testUserId) {
      const userRepository = new UserRepository(database);
      const user = await userRepository.findById(testUserId);
      if (user) {
        await userRepository.update(testUserId, {
          preferences: {
            notifications: {
              push: true,
              email: true,
              sms: false,
            },
            alerts: {
              gradeDrop: 5,
              daysBeforeDeadline: 2,
              lowGradeThreshold: 80,
            },
          },
        });
      }
    }
  });

  describe('GET /api/settings', () => {
    it('should return 401 without auth token', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.use('/api/settings', settingsRouter({ database }));

      const response = await request(appWithoutAuth).get('/api/settings');

      expect(response.status).toBe(401);
    });

    it('should return user settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('alerts');
      expect(response.body.notifications).toHaveProperty('push');
      expect(response.body.notifications).toHaveProperty('email');
      expect(response.body.notifications).toHaveProperty('sms');
    });

    it('should return defaults for new user', async () => {
      // Clean up any existing user first
      await database.collection('users').deleteMany({ email: 'newuser@example.com' });

      // Create a new user without settings
      const newUserResult = await authService.register(
        'newuser@example.com',
        'password123',
        'New User'
      );
      let newToken = newUserResult.token ?? '';

      // If registration didn't return token, try login
      if (!newToken && newUserResult.success) {
        const loginResult = await authService.login('newuser@example.com', 'password123');
        newToken = loginResult.token ?? '';
      }

      if (!newToken) {
        // If still no token, user might already exist - try login
        const loginResult = await authService.login('newuser@example.com', 'password123');
        if (loginResult.success && loginResult.token) {
          newToken = loginResult.token;
        }
      }

      if (!newToken) {
        throw new Error(
          `Failed to get token for new user: ${newUserResult.error ?? 'Unknown error'}`
        );
      }

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${newToken}`);

      expect(response.status).toBe(200);
      expect(response.body.notifications.push).toBe(true);
      expect(response.body.notifications.email).toBe(true);
      expect(response.body.alerts.gradeDrop).toBe(5);
    });
  });

  describe('PUT /api/settings', () => {
    it('should update notification preferences', async () => {
      const updateData = {
        notifications: {
          push: false,
          email: true,
          sms: true,
        },
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.notifications.push).toBe(false);
      expect(response.body.notifications.email).toBe(true);
      expect(response.body.notifications.sms).toBe(true);
    });

    it('should update alert thresholds', async () => {
      const updateData = {
        alerts: {
          gradeDrop: 10,
          daysBeforeDeadline: 3,
          lowGradeThreshold: 75,
        },
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.alerts.gradeDrop).toBe(10);
      expect(response.body.alerts.daysBeforeDeadline).toBe(3);
      expect(response.body.alerts.lowGradeThreshold).toBe(75);
    });

    it('should update both notifications and alerts', async () => {
      const updateData = {
        notifications: {
          push: false,
          email: false,
          sms: true,
        },
        alerts: {
          gradeDrop: 15,
          daysBeforeDeadline: 5,
          lowGradeThreshold: 70,
        },
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.notifications.sms).toBe(true);
      expect(response.body.alerts.gradeDrop).toBe(15);
    });

    it('should validate threshold values', async () => {
      const updateData = {
        alerts: {
          gradeDrop: -5, // Invalid negative value
        },
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/settings/notifications', () => {
    it('should update only notification preferences', async () => {
      const updateData = {
        push: false,
        email: false,
        sms: true,
      };

      const response = await request(app)
        .put('/api/settings/notifications')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.notifications.push).toBe(false);
      expect(response.body.notifications.email).toBe(false);
      expect(response.body.notifications.sms).toBe(true);
      // Alerts should remain unchanged
      expect(response.body.alerts.gradeDrop).toBe(5);
    });
  });

  describe('PUT /api/settings/alerts', () => {
    it('should update only alert thresholds', async () => {
      const updateData = {
        gradeDrop: 8,
        daysBeforeDeadline: 4,
        lowGradeThreshold: 85,
      };

      const response = await request(app)
        .put('/api/settings/alerts')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.alerts.gradeDrop).toBe(8);
      expect(response.body.alerts.daysBeforeDeadline).toBe(4);
      expect(response.body.alerts.lowGradeThreshold).toBe(85);
      // Notifications should remain unchanged
      expect(response.body.notifications.push).toBe(true);
    });
  });

  describe('PUT /api/settings: the text consent on record follows what the person says', () => {
    const FIRST = '+15125550141';
    const SECOND = '+15125550142';
    const LONG_AGO = new Date('2026-01-05T10:00:00.000Z');

    interface IProfileBody {
      phone?: string;
      smsConsent?: boolean;
    }

    const consents = (): SmsConsentRepository => new SmsConsentRepository(database);
    const onRecord = (phone: string): Promise<ISmsConsentRecord | null> =>
      consents().findByPhoneAndPurpose(phone, SCHOLARMANCY_SMS_PURPOSE);
    const consentStands = (phone: string): Promise<boolean> =>
      consents().hasActiveConsent(phone, SCHOLARMANCY_SMS_PURPOSE);

    /** A save as the web Settings page sends it: the number and the box with every save. */
    const save = (profile: IProfileBody | undefined, rest: object = {}): request.Test =>
      request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send({ ...rest, ...(profile ? { profile } : {}) });

    const account = async (): Promise<{ phone?: string | null; smsConsent?: boolean }> => {
      const user = await new UserRepository(database).findById(testUserId);
      return { phone: user?.phone, smsConsent: user?.smsConsent };
    };

    /** The consent as given on a day long ago, so a rewrite of it would show. */
    const backdate = (phone: string): Promise<unknown> =>
      database
        .collection('sms_consents')
        .updateOne(
          { phoneE164: phone, purpose: SCHOLARMANCY_SMS_PURPOSE },
          { $set: { consentedAt: LONG_AGO } }
        );

    beforeEach(async () => {
      await database.collection('sms_consents').deleteMany({ phoneE164: { $in: [FIRST, SECOND] } });
      await new UserRepository(database).update(testUserId, {
        phone: undefined,
        smsConsent: false,
      });
    });

    it('ticking the box records the consent for the number', async () => {
      const response = await save({ phone: FIRST, smsConsent: true });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(true);
      expect((await onRecord(FIRST))?.source).toBe('/dashboard/settings');
      expect(await account()).toEqual({ phone: FIRST, smsConsent: true });
    });

    it('unticking the box withdraws the consent for the number', async () => {
      await save({ phone: FIRST, smsConsent: true });

      const response = await save({ phone: FIRST, smsConsent: false });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(false);
      expect((await onRecord(FIRST))?.revokedAt).toBeInstanceOf(Date);
      expect(await account()).toEqual({ phone: FIRST, smsConsent: false });
    });

    it('changing the number withdraws the consent for the old one and records it for the new one', async () => {
      await save({ phone: FIRST, smsConsent: true });

      const response = await save({ phone: SECOND, smsConsent: true });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(false);
      expect(await consentStands(SECOND)).toBe(true);
      expect(await account()).toEqual({ phone: SECOND, smsConsent: true });
    });

    it('changing the number with the box unticked withdraws the old consent and records none for the new number', async () => {
      await save({ phone: FIRST, smsConsent: true });

      await save({ phone: SECOND, smsConsent: false });

      expect(await consentStands(FIRST)).toBe(false);
      expect(await onRecord(SECOND)).toBeNull();
    });

    it('removing the number withdraws the consent for it', async () => {
      await save({ phone: FIRST, smsConsent: true });

      const response = await save({ phone: '', smsConsent: false });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(false);
      expect((await account()).phone ?? null).toBeNull();
    });

    it('a consent does not move to a new number when the save does not say the box is ticked', async () => {
      await save({ phone: FIRST, smsConsent: true });

      const response = await save({ phone: SECOND });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(false);
      expect(await onRecord(SECOND)).toBeNull();
      expect(await account()).toEqual({ phone: SECOND, smsConsent: false });
    });

    it('a save that is refused changes nothing on record', async () => {
      await save({ phone: FIRST, smsConsent: true });

      const noNumber = await save({ phone: '', smsConsent: true });
      const badNumber = await save({ phone: '12', smsConsent: false });

      expect(noNumber.status).toBe(400);
      expect(badNumber.status).toBe(400);
      expect(await consentStands(FIRST)).toBe(true);
      expect(await account()).toEqual({ phone: FIRST, smsConsent: true });
    });

    it('a save that says nothing about the number or the box leaves the consent as it is', async () => {
      await save({ phone: FIRST, smsConsent: true });
      await backdate(FIRST);

      const response = await save(undefined, { notifications: { push: false } });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(true);
      expect((await onRecord(FIRST))?.consentedAt).toEqual(LONG_AGO);
      expect(await account()).toEqual({ phone: FIRST, smsConsent: true });
    });

    it('saving again with the box still ticked keeps the day the consent was given', async () => {
      await save({ phone: FIRST, smsConsent: true });
      await backdate(FIRST);

      const response = await save(
        { phone: FIRST, smsConsent: true },
        { timezone: 'America/Chicago' }
      );

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(true);
      expect((await onRecord(FIRST))?.consentedAt).toEqual(LONG_AGO);
    });

    it('saving again with the box still ticked does not undo a STOP reply', async () => {
      await save({ phone: FIRST, smsConsent: true });
      // What the inbound webhook records when the person replies STOP.
      await consents().recordOptOut(FIRST, SCHOLARMANCY_SMS_PURPOSE);

      const response = await save(
        { phone: FIRST, smsConsent: true },
        { timezone: 'America/Chicago' }
      );

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(false);
    });

    it('unticking the box and ticking it again is a new consent, also after a STOP reply', async () => {
      await save({ phone: FIRST, smsConsent: true });
      await consents().recordOptOut(FIRST, SCHOLARMANCY_SMS_PURPOSE);

      await save({ phone: FIRST, smsConsent: false });
      await save({ phone: FIRST, smsConsent: true });

      expect(await consentStands(FIRST)).toBe(true);
    });

    it('an account with the box ticked and nothing on record gets its consent recorded at the next save', async () => {
      // An account from before consents were recorded.
      await new UserRepository(database).update(testUserId, { phone: FIRST, smsConsent: true });

      const response = await save({ phone: FIRST, smsConsent: true });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(true);
    });

    it('a consent given elsewhere for the number stands when the box was never ticked', async () => {
      // The person opted in through a link a parent shared; their own account never ticked the box.
      await new UserRepository(database).update(testUserId, { phone: FIRST, smsConsent: false });
      await consents().recordOptIn({
        phoneE164: FIRST,
        purpose: SCHOLARMANCY_SMS_PURPOSE,
        consentTextVersion: 'test',
        source: '/sms/optin',
      });

      await save({ phone: FIRST, smsConsent: false });
      expect(await consentStands(FIRST)).toBe(true);

      await save({ phone: SECOND, smsConsent: false });
      expect(await consentStands(FIRST)).toBe(true);
    });

    it('a number stored in another spelling is still the same number', async () => {
      await save({ phone: FIRST, smsConsent: true });
      await backdate(FIRST);

      const response = await save({ phone: '(512) 555-0141', smsConsent: true });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(true);
      expect((await onRecord(FIRST))?.consentedAt).toEqual(LONG_AGO);
    });

    it('ticking the box without sending the number records the consent for the number on the account', async () => {
      await new UserRepository(database).update(testUserId, { phone: FIRST, smsConsent: false });

      const response = await save({ smsConsent: true });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(true);
      expect(await account()).toEqual({ phone: FIRST, smsConsent: true });
    });

    it('unticking the box without sending the number withdraws the consent for the number on the account', async () => {
      await save({ phone: FIRST, smsConsent: true });

      const response = await save({ smsConsent: false });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(false);
      expect(await account()).toEqual({ phone: FIRST, smsConsent: false });
    });

    it('a STOP reply from a number with no consent on record stands when the box is ticked again and again', async () => {
      // An account from before consents were recorded, whose person replied STOP.
      await new UserRepository(database).update(testUserId, { phone: FIRST, smsConsent: true });
      await consents().recordOptOut(FIRST, SCHOLARMANCY_SMS_PURPOSE);

      await save({ phone: FIRST, smsConsent: true });

      expect(await consentStands(FIRST)).toBe(false);
    });

    it('a record that holds neither a consent nor a refusal does not stand in the way of the ticked box', async () => {
      // STOP and then START from a number that had no consent on record leave such a record.
      await new UserRepository(database).update(testUserId, { phone: FIRST, smsConsent: true });
      await consents().recordOptOut(FIRST, SCHOLARMANCY_SMS_PURPOSE);
      await consents().clearOptOut(FIRST, SCHOLARMANCY_SMS_PURPOSE);
      expect(await consentStands(FIRST)).toBe(false);

      await save({ phone: FIRST, smsConsent: true });

      expect(await consentStands(FIRST)).toBe(true);
    });

    it('an account whose stored number cannot be read as one withdraws nothing and takes the new number', async () => {
      await new UserRepository(database).update(testUserId, { phone: 'ask me', smsConsent: true });

      const response = await save({ phone: FIRST, smsConsent: true });

      expect(response.status).toBe(200);
      expect(await consentStands(FIRST)).toBe(true);
      expect(await account()).toEqual({ phone: FIRST, smsConsent: true });
    });

    describe('when the account cannot be saved', () => {
      const failTheNextAccountSave = (): jest.SpyInstance =>
        jest.spyOn(UserRepository.prototype, 'update').mockRejectedValueOnce(new Error('down'));

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('the consent is withdrawn all the same: fewer texts, never more', async () => {
        await save({ phone: FIRST, smsConsent: true });
        failTheNextAccountSave();

        const response = await save({ phone: FIRST, smsConsent: false });

        expect(response.status).toBe(500);
        expect(await consentStands(FIRST)).toBe(false);
      });

      it('no consent is recorded', async () => {
        failTheNextAccountSave();

        const response = await save({ phone: FIRST, smsConsent: true });

        expect(response.status).toBe(500);
        expect(await onRecord(FIRST)).toBeNull();
      });
    });
  });
});
