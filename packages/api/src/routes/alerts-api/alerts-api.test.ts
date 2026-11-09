import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { AlertRepository, StudentRepository } from '@scholaracle/database';
import { alertsApiRouter } from './alerts-api';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('Alerts API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let alertRepo: AlertRepository;
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

    authService = new AuthService(database);
    alertRepo = new AlertRepository(database);

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/alerts-api', authMiddleware(authService), alertsApiRouter({ database }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    if (database) {
      // Clean up test data before each test
      await database.collection('alerts').deleteMany({});
      await database.collection('users').deleteMany({ email: 'alerts@example.com' });

      // Re-register test user for each test
      const registerResult = await authService.register(
        'alerts@example.com',
        'password123',
        'Alerts User'
      );
      if (registerResult.success && registerResult.user && registerResult.token) {
        testUserId = registerResult.user.id;
        testToken = registerResult.token;
      } else {
        throw new Error(`Failed to register test user: ${registerResult.error ?? 'Unknown error'}`);
      }
    }
  });

  describe('GET /api/alerts-api', () => {
    it('should return empty array when user has no alerts', async () => {
      const response = await request(app)
        .get('/api/alerts-api')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return alerts for user', async () => {
      // Insert test alerts directly via repository
      await alertRepo.create({
        userId: testUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Test alert one',
      });

      await alertRepo.create({
        userId: testUserId,
        studentId: 'student-2',
        type: 'grade_drop',
        severity: 'medium',
        message: 'Test alert two',
      });

      const response = await request(app)
        .get('/api/alerts-api')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('message');
      expect(response.body[0]).toHaveProperty('type');
      expect(response.body[0]).toHaveProperty('severity');
    });
  });

  describe('GET /api/alerts-api/:id', () => {
    it('should get single alert by id', async () => {
      const alert = await alertRepo.create({
        userId: testUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Test alert',
      });

      const alertId = alert.id ?? '';

      const response = await request(app)
        .get(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(alertId);
      expect(response.body.message).toBe('Test alert');
      expect(response.body.type).toBe('missing_assignment');
      expect(response.body.severity).toBe('high');
    });

    it('should return 404 for non-existent alert', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .get(`/api/alerts-api/${fabricatedId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 403 when accessing another user alert', async () => {
      // Create an alert belonging to a different user
      const otherUserId = new ObjectId().toString();
      const alert = await alertRepo.create({
        userId: otherUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Other user alert',
      });

      const alertId = alert.id ?? '';

      const response = await request(app)
        .get(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/alerts-api/:id/acknowledge', () => {
    it('should acknowledge an alert', async () => {
      const alert = await alertRepo.create({
        userId: testUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Alert to acknowledge',
      });

      const alertId = alert.id ?? '';

      const response = await request(app)
        .post(`/api/alerts-api/${alertId}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 when acknowledging non-existent alert', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .post(`/api/alerts-api/${fabricatedId}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/alerts-api/:id', () => {
    it('should delete an alert', async () => {
      const alert = await alertRepo.create({
        userId: testUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Alert to delete',
      });

      const alertId = alert.id ?? '';

      const response = await request(app)
        .delete(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify alert is gone
      const getResponse = await request(app)
        .get(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when deleting non-existent alert', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .delete(`/api/alerts-api/${fabricatedId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('inbox by access and per-person acknowledgement (sharing S3)', () => {
    const MEMBER = 'member-s3@example.com';
    const STRANGER = 'stranger-s3@example.com';
    let memberToken: string;
    let memberUserId: string;
    let strangerToken: string;
    let sharedStudentId: string;
    let privateStudentId: string;
    let sharedAlertId: string;
    let ingestAlertId: string;
    let privateAlertId: string;

    async function setMemberRow(patch: Record<string, unknown>): Promise<void> {
      await database.collection('students').updateOne(
        { _id: new ObjectId(sharedStudentId) },
        {
          $set: Object.fromEntries(Object.entries(patch).map(([k, v]) => [`sharedWith.0.${k}`, v])),
        }
      );
    }

    async function inbox(token: string): Promise<Array<Record<string, unknown>>> {
      const res = await request(app).get('/api/alerts-api').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      return res.body as Array<Record<string, unknown>>;
    }

    beforeEach(async () => {
      await database.collection('students').deleteMany({});
      await database.collection('users').deleteMany({ email: { $in: [MEMBER, STRANGER] } });
      const member = await authService.register(MEMBER, 'password123', 'Member');
      const stranger = await authService.register(STRANGER, 'password123', 'Stranger');
      if (!member.token || !member.user || !stranger.token) {
        throw new Error('Failed to register S3 test users');
      }
      memberToken = member.token;
      memberUserId = member.user.id;
      strangerToken = stranger.token;

      const students = new StudentRepository(database);
      const shared = await students.create({
        userId: testUserId,
        name: 'Ava',
        studentId: 'skyward:12345',
        sharedWith: [
          {
            userId: memberUserId,
            email: MEMBER,
            role: 'parent',
            status: 'accepted',
            invitedAt: new Date(),
            acceptedAt: new Date(),
            receiveAlerts: true,
            alertChannels: ['email', 'push'],
          },
        ],
      });
      const priv = await students.create({ userId: testUserId, name: 'Gideon' });
      sharedStudentId = shared._id!.toString();
      privateStudentId = priv._id!.toString();

      // Seed/job-shaped row (Mongo id), ingest-shaped row (portal student id), and an
      // alert for a student the member was never given.
      sharedAlertId = (
        await alertRepo.create({
          userId: testUserId,
          studentId: sharedStudentId,
          type: 'grade_drop',
          severity: 'warning',
          message: 'Ava: Math fell to 72',
        })
      ).id!;
      ingestAlertId = (
        await alertRepo.create({
          userId: testUserId,
          studentId: '12345',
          type: 'missing_assignment',
          severity: 'critical',
          message: 'Ava: Lab 4 missing',
        })
      ).id!;
      privateAlertId = (
        await alertRepo.create({
          userId: testUserId,
          studentId: privateStudentId,
          type: 'grade_drop',
          severity: 'warning',
          message: 'Gideon: Science fell',
        })
      ).id!;
    });

    it('owner sees every alert; member sees only the shared student, incl. ingest rows keyed by portal id', async () => {
      const ownerIds = (await inbox(testToken)).map((a) => a['id']);
      expect(ownerIds).toEqual(
        expect.arrayContaining([sharedAlertId, ingestAlertId, privateAlertId])
      );
      expect(ownerIds).toHaveLength(3);

      const memberRows = await inbox(memberToken);
      expect(memberRows.map((a) => a['id']).sort()).toEqual([sharedAlertId, ingestAlertId].sort());
      expect(memberRows.every((a) => a['acknowledged'] === false)).toBe(true);

      expect(await inbox(strangerToken)).toEqual([]);
    });

    it("trims the inbox to the member's own alertTypes for that student", async () => {
      await setMemberRow({ alertTypes: ['missing_assignment'] });
      const rows = await inbox(memberToken);
      expect(rows.map((a) => a['id'])).toEqual([ingestAlertId]);
      // The owner's inbox is untouched by someone else's filter.
      expect(await inbox(testToken)).toHaveLength(3);
    });

    it('a revoked adult loses the alerts at once (list, single, acknowledge)', async () => {
      await database
        .collection('students')
        .updateOne({ _id: new ObjectId(sharedStudentId) }, { $set: { sharedWith: [] } });
      expect(await inbox(memberToken)).toEqual([]);
      const single = await request(app)
        .get(`/api/alerts-api/${sharedAlertId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(single.status).toBe(403);
      const ack = await request(app)
        .post(`/api/alerts-api/${sharedAlertId}/acknowledge`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(ack.status).toBe(403);
    });

    it('acknowledgement is per person: the member acks, the owner still sees it unread and legacy fields stay', async () => {
      const ack = await request(app)
        .post(`/api/alerts-api/${sharedAlertId}/acknowledge`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(ack.status).toBe(200);

      const memberView = (await inbox(memberToken)).find((a) => a['id'] === sharedAlertId);
      expect(memberView).toMatchObject({ acknowledged: true });
      expect(typeof memberView?.['acknowledgedAt']).toBe('string');

      const ownerView = (await inbox(testToken)).find((a) => a['id'] === sharedAlertId);
      expect(ownerView).toMatchObject({ acknowledged: false });
      expect(ownerView?.['acknowledgedAt']).toBeUndefined();

      const row = await database.collection('alerts').findOne({ _id: new ObjectId(sharedAlertId) });
      expect(row?.['acknowledged']).toBe(false);
      expect(row?.['acknowledgedAt']).toBeUndefined();
      expect(Object.keys(row?.['acknowledgedBy'] as Record<string, string>)).toEqual([
        memberUserId,
      ]);
    });

    it("the owner's acknowledgement writes the legacy fields and is theirs alone", async () => {
      const ack = await request(app)
        .post(`/api/alerts-api/${sharedAlertId}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(ack.status).toBe(200);

      const row = await database.collection('alerts').findOne({ _id: new ObjectId(sharedAlertId) });
      expect(row?.['acknowledged']).toBe(true);
      expect(row?.['acknowledgedAt']).toBeInstanceOf(Date);
      expect(Object.keys(row?.['acknowledgedBy'] as Record<string, string>)).toEqual([testUserId]);

      const single = await request(app)
        .get(`/api/alerts-api/${sharedAlertId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(single.status).toBe(200);
      expect(single.body.acknowledged).toBe(false);
    });

    it('a legacy row acknowledged before the migration still reads as acknowledged for the owner only', async () => {
      await database
        .collection('alerts')
        .updateOne(
          { _id: new ObjectId(sharedAlertId) },
          { $set: { acknowledged: true, acknowledgedAt: new Date('2026-11-01T00:00:00Z') } }
        );
      const ownerView = (await inbox(testToken)).find((a) => a['id'] === sharedAlertId);
      expect(ownerView).toMatchObject({
        acknowledged: true,
        acknowledgedAt: '2026-11-01T00:00:00.000Z',
      });
      const memberView = (await inbox(memberToken)).find((a) => a['id'] === sharedAlertId);
      expect(memberView).toMatchObject({ acknowledged: false });
    });

    it('delete stays owner-only', async () => {
      const memberDelete = await request(app)
        .delete(`/api/alerts-api/${sharedAlertId}`)
        .set('Authorization', `Bearer ${memberToken}`);
      expect(memberDelete.status).toBe(403);
      const ownerDelete = await request(app)
        .delete(`/api/alerts-api/${sharedAlertId}`)
        .set('Authorization', `Bearer ${testToken}`);
      expect(ownerDelete.status).toBe(200);
    });
  });
});
