import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { seedRouter } from './seed';

describe('Seed API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;

  beforeAll(async () => {
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

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    if (database) {
      // Clean all seeded collections before each test
      await Promise.all([
        database.collection('users').deleteMany({
          email: {
            $in: [
              'test.parent@example.com',
              'test.parent2@example.com',
              'test.parent3@example.com',
            ],
          },
        }),
        database.collection('admin_users').deleteMany({
          email: {
            $in: ['admin@scholarmancy.com', 'analyst@scholarmancy.com'],
          },
        }),
        database.collection('students').deleteMany({
          name: { $in: ['Student One', 'Student Two'] },
        }),
        database.collection('alerts').deleteMany({
          type: { $in: ['MISSING_ASSIGNMENT', 'GRADE_DROP'] },
        }),
        database.collection('payments').deleteMany({
          status: { $in: ['succeeded', 'failed'] },
        }),
        database.collection('subscriptions').deleteMany({
          plan: 'starter',
        }),
        database.collection('audit_logs').deleteMany({
          action: 'system:export',
        }),
        database.collection('communication_logs').deleteMany({
          subject: 'Seed Communication',
        }),
      ]);
    }
  });

  describe('POST /api/seed', () => {
    describe('environment guard', () => {
      it('should return 403 when NODE_ENV is production', async () => {
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'production';

        try {
          const response = await request(app).post('/api/seed');

          expect(response.status).toBe(403);
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBe('Seeding is not allowed in production');
        } finally {
          process.env['NODE_ENV'] = originalEnv;
        }
      });

      it('should allow seeding when NODE_ENV is development', async () => {
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'development';

        try {
          const response = await request(app).post('/api/seed');

          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
        } finally {
          process.env['NODE_ENV'] = originalEnv;
        }
      });

      it('should allow seeding when NODE_ENV is test', async () => {
        const originalEnv = process.env['NODE_ENV'];
        process.env['NODE_ENV'] = 'test';

        try {
          const response = await request(app).post('/api/seed');

          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
        } finally {
          process.env['NODE_ENV'] = originalEnv;
        }
      });

      it('should allow seeding when NODE_ENV is undefined', async () => {
        const originalEnv = process.env['NODE_ENV'];
        delete process.env['NODE_ENV'];

        try {
          const response = await request(app).post('/api/seed');

          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
        } finally {
          process.env['NODE_ENV'] = originalEnv;
        }
      });
    });

    describe('user creation', () => {
      it('should create parent users successfully', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.results.users.created).toEqual(
          expect.arrayContaining([
            expect.stringContaining('test.parent@example.com'),
            expect.stringContaining('test.parent2@example.com'),
            expect.stringContaining('test.parent3@example.com'),
          ])
        );
        expect(response.body.totals.usersCreated).toBe(3);
        expect(response.body.totals.usersErrors).toBe(0);
      });

      it('should store parent user in the database', async () => {
        await request(app).post('/api/seed');

        const user = await database
          .collection('users')
          .findOne({ email: 'test.parent@example.com' });

        expect(user).not.toBeNull();
        expect(user!['name']).toBe('Test Parent');
        expect(user!['email']).toBe('test.parent@example.com');
      });
    });

    describe('admin creation', () => {
      it('should create all admin users', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body.results.admins.created).toEqual(
          expect.arrayContaining([
            expect.stringContaining('admin@scholarmancy.com'),
            expect.stringContaining('analyst@scholarmancy.com'),
          ])
        );
        expect(response.body.totals.adminsCreated).toBe(2);
        expect(response.body.totals.adminsErrors).toBe(0);
      });

      it('should store admin user in the database with correct role', async () => {
        await request(app).post('/api/seed');

        const admin = await database.collection('admin_users').findOne({ email: 'admin@scholarmancy.com' });
        expect(admin).not.toBeNull();
        expect(admin!['role']).toBe('admin');
        expect(admin!['isActive']).toBe(true);

        const analyst = await database.collection('admin_users').findOne({ email: 'analyst@scholarmancy.com' });
        expect(analyst).not.toBeNull();
        expect(analyst!['role']).toBe('admin');
        expect(analyst!['isActive']).toBe(true);
      });
    });

    describe('student creation', () => {
      it('should create test students linked to parent user', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body.results.students.created).toEqual(
          expect.arrayContaining([
            expect.stringContaining('Student One'),
            expect.stringContaining('Student Two'),
          ])
        );
        expect(response.body.totals.studentsCreated).toBe(2);
        expect(response.body.totals.studentsErrors).toBe(0);
      });

      it('should store students in the database with correct data', async () => {
        await request(app).post('/api/seed');

        const parentUser = await database
          .collection('users')
          .findOne({ email: 'test.parent@example.com' });

        expect(parentUser).not.toBeNull();

        const students = await database
          .collection('students')
          .find({ userId: parentUser!._id })
          .toArray();

        expect(students).toHaveLength(2);

        const studentOne = students.find((s) => s['name'] === 'Student One');
        const studentTwo = students.find((s) => s['name'] === 'Student Two');

        expect(studentOne).toBeDefined();
        expect(studentOne!['grade']).toBe(9);
        expect(studentOne!['studentId']).toBe('STU001');

        expect(studentTwo).toBeDefined();
        expect(studentTwo!['grade']).toBe(11);
        expect(studentTwo!['studentId']).toBe('STU002');
      });
    });

    describe('alert creation', () => {
      it('should create test alerts linked to first student', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body.results.alerts.created).toEqual(
          expect.arrayContaining([
            expect.stringContaining('MISSING_ASSIGNMENT'),
            expect.stringContaining('GRADE_DROP'),
          ])
        );
        expect(response.body.totals.alertsCreated).toBe(2);
        expect(response.body.totals.alertsErrors).toBe(0);
      });

      it('should store alerts in the database with correct data', async () => {
        await request(app).post('/api/seed');

        const alerts = await database
          .collection('alerts')
          .find({ type: { $in: ['MISSING_ASSIGNMENT', 'GRADE_DROP'] } })
          .toArray();

        expect(alerts).toHaveLength(2);

        const missingAssignment = alerts.find((a) => a['type'] === 'MISSING_ASSIGNMENT');
        expect(missingAssignment).toBeDefined();
        expect(missingAssignment!['severity']).toBe('warning');
        expect(missingAssignment!['message']).toBe('Math homework due tomorrow');
        expect(missingAssignment!['acknowledged']).toBe(false);

        const gradeDrop = alerts.find((a) => a['type'] === 'GRADE_DROP');
        expect(gradeDrop).toBeDefined();
        expect(gradeDrop!['severity']).toBe('critical');
        expect(gradeDrop!['message']).toBe('Science grade dropped 10%');
      });
    });

    describe('payment creation', () => {
      it('should create test payments', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body.results.payments.created).toEqual(
          expect.arrayContaining([
            expect.stringContaining('succeeded'),
            expect.stringContaining('failed'),
          ])
        );
        expect(response.body.totals.paymentsCreated).toBe(2);
        expect(response.body.totals.paymentsErrors).toBe(0);
      });

      it('should store payments in the database with correct amounts', async () => {
        await request(app).post('/api/seed');

        const parentUser = await database
          .collection('users')
          .findOne({ email: 'test.parent@example.com' });
        expect(parentUser).not.toBeNull();

        const payments = await database
          .collection('payments')
          .find({ userId: parentUser!._id.toString() })
          .toArray();

        expect(payments).toHaveLength(2);

        const succeeded = payments.find((p) => p['status'] === 'succeeded');
        expect(succeeded).toBeDefined();
        expect(succeeded!['amount']).toBe(1900);
        expect(succeeded!['currency']).toBe('usd');

        const failed = payments.find((p) => p['status'] === 'failed');
        expect(failed).toBeDefined();
        expect(failed!['amount']).toBe(2900);
      });
    });

    describe('subscription creation', () => {
      it('should create test subscription', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body.results.subscriptions.created).toEqual(
          expect.arrayContaining([expect.stringContaining('trialing')])
        );
        expect(response.body.totals.subscriptionsCreated).toBe(1);
        expect(response.body.totals.subscriptionsErrors).toBe(0);
      });

      it('should store subscription in the database with correct plan', async () => {
        await request(app).post('/api/seed');

        const subscription = await database
          .collection('subscriptions')
          .findOne({ plan: 'starter' });

        expect(subscription).not.toBeNull();
        expect(subscription!['status']).toBe('trialing');
        expect(subscription!['billingCycle']).toBe('monthly');
      });
    });

    describe('audit log creation', () => {
      it('should create baseline audit log', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body.results.auditLogs.created).toEqual(
          expect.arrayContaining([expect.stringContaining('system:export')])
        );
        expect(response.body.totals.auditLogsCreated).toBe(1);
        expect(response.body.totals.auditLogsErrors).toBe(0);
      });

      it('should store audit log in the database', async () => {
        await request(app).post('/api/seed');

        const auditLog = await database
          .collection('audit_logs')
          .findOne({ action: 'system:export' });

        expect(auditLog).not.toBeNull();
        expect(auditLog!['adminEmail']).toBe('admin@scholarmancy.com');
        expect(auditLog!['entityType']).toBe('system');
        expect(auditLog!['entityId']).toBe('seed');
        expect(auditLog!['reason']).toBe('Seed baseline audit entry');
      });
    });

    describe('communication log creation', () => {
      it('should create baseline communication log', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body.results.communications.created).toEqual(
          expect.arrayContaining([expect.stringContaining('Seed Communication')])
        );
        expect(response.body.totals.communicationsCreated).toBe(1);
        expect(response.body.totals.communicationsErrors).toBe(0);
      });

      it('should store communication log in the database', async () => {
        await request(app).post('/api/seed');

        const commLog = await database
          .collection('communication_logs')
          .findOne({ subject: 'Seed Communication' });

        expect(commLog).not.toBeNull();
        expect(commLog!['channel']).toBe('email');
        expect(commLog!['type']).toBe('support');
        expect(commLog!['content']).toBe('This is a seeded communication log entry.');
        expect(commLog!['status']).toBe('sent');
        expect(commLog!['triggeredBy']).toBe('admin');
      });
    });

    describe('response shape', () => {
      it('should return correct totals structure', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message', 'Seeding completed');
        expect(response.body).toHaveProperty('results');
        expect(response.body).toHaveProperty('totals');

        const { totals } = response.body;
        expect(totals).toHaveProperty('usersCreated');
        expect(totals).toHaveProperty('usersExisting');
        expect(totals).toHaveProperty('usersErrors');
        expect(totals).toHaveProperty('adminsCreated');
        expect(totals).toHaveProperty('adminsExisting');
        expect(totals).toHaveProperty('adminsErrors');
        expect(totals).toHaveProperty('studentsCreated');
        expect(totals).toHaveProperty('studentsErrors');
        expect(totals).toHaveProperty('alertsCreated');
        expect(totals).toHaveProperty('alertsErrors');
        expect(totals).toHaveProperty('paymentsCreated');
        expect(totals).toHaveProperty('paymentsErrors');
        expect(totals).toHaveProperty('subscriptionsCreated');
        expect(totals).toHaveProperty('subscriptionsErrors');
        expect(totals).toHaveProperty('auditLogsCreated');
        expect(totals).toHaveProperty('auditLogsErrors');
        expect(totals).toHaveProperty('communicationsCreated');
        expect(totals).toHaveProperty('communicationsErrors');
      });

      it('should return correct totals for a full fresh seed', async () => {
        const response = await request(app).post('/api/seed');

        expect(response.status).toBe(200);
        const { totals } = response.body;

        expect(totals.usersCreated).toBe(3);
        expect(totals.usersExisting).toBe(0);
        expect(totals.usersErrors).toBe(0);
        expect(totals.adminsCreated).toBe(2);
        expect(totals.adminsExisting).toBe(0);
        expect(totals.adminsErrors).toBe(0);
        expect(totals.studentsCreated).toBe(2);
        expect(totals.studentsErrors).toBe(0);
        expect(totals.alertsCreated).toBe(2);
        expect(totals.alertsErrors).toBe(0);
        expect(totals.paymentsCreated).toBe(2);
        expect(totals.paymentsErrors).toBe(0);
        expect(totals.subscriptionsCreated).toBe(1);
        expect(totals.subscriptionsErrors).toBe(0);
        expect(totals.auditLogsCreated).toBe(1);
        expect(totals.auditLogsErrors).toBe(0);
        expect(totals.communicationsCreated).toBe(1);
        expect(totals.communicationsErrors).toBe(0);
      });
    });

    describe('idempotency (without force)', () => {
      it('should not duplicate users on second call', async () => {
        // First seed
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.usersCreated).toBe(3);

        // Second seed without force
        const second = await request(app).post('/api/seed');
        expect(second.status).toBe(200);
        expect(second.body.totals.usersCreated).toBe(0);
        expect(second.body.totals.usersExisting).toBe(3);
        expect(second.body.totals.usersErrors).toBe(0);
      });

      it('should not duplicate admin users on second call', async () => {
        // First seed
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.adminsCreated).toBe(2);

        // Second seed without force
        const second = await request(app).post('/api/seed');
        expect(second.status).toBe(200);
        expect(second.body.totals.adminsCreated).toBe(0);
        expect(second.body.totals.adminsExisting).toBe(2);
        expect(second.body.totals.adminsErrors).toBe(0);
      });

      it('should not duplicate students on second call', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.studentsCreated).toBe(2);

        const second = await request(app).post('/api/seed');
        expect(second.status).toBe(200);
        // Students are skipped if they already exist (no separate "existing" counter)
        expect(second.body.totals.studentsCreated).toBe(0);

        // Verify the database still has only 2 students
        const parentUser = await database
          .collection('users')
          .findOne({ email: 'test.parent@example.com' });
        const students = await database
          .collection('students')
          .find({ userId: parentUser!._id })
          .toArray();
        expect(students).toHaveLength(2);
      });

      it('should not duplicate payments on second call', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.paymentsCreated).toBe(2);

        const second = await request(app).post('/api/seed');
        expect(second.status).toBe(200);
        expect(second.body.totals.paymentsCreated).toBe(0);
      });

      it('should not duplicate subscriptions on second call', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.subscriptionsCreated).toBe(1);

        const second = await request(app).post('/api/seed');
        expect(second.status).toBe(200);
        expect(second.body.totals.subscriptionsCreated).toBe(0);
      });

      it('should not duplicate audit logs on second call', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.auditLogsCreated).toBe(1);

        const second = await request(app).post('/api/seed');
        expect(second.status).toBe(200);
        expect(second.body.totals.auditLogsCreated).toBe(0);
      });

      it('should not duplicate communication logs on second call', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.communicationsCreated).toBe(1);

        const second = await request(app).post('/api/seed');
        expect(second.status).toBe(200);
        expect(second.body.totals.communicationsCreated).toBe(0);
      });
    });

    describe('force mode (force=true)', () => {
      it('should delete and recreate users when force=true', async () => {
        // First seed
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.usersCreated).toBe(3);

        // Force seed
        const forced = await request(app).post('/api/seed?force=true');
        expect(forced.status).toBe(200);
        expect(forced.body.totals.usersCreated).toBe(3);
        expect(forced.body.totals.usersExisting).toBe(0);
        expect(forced.body.totals.usersErrors).toBe(0);
      });

      it('should delete and recreate admin users when force=true', async () => {
        // First seed
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.adminsCreated).toBe(2);

        // Force seed
        const forced = await request(app).post('/api/seed?force=true');
        expect(forced.status).toBe(200);
        expect(forced.body.totals.adminsCreated).toBe(2);
        expect(forced.body.totals.adminsExisting).toBe(0);
        expect(forced.body.totals.adminsErrors).toBe(0);
      });

      it('should delete and recreate students when force=true', async () => {
        // First seed
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.studentsCreated).toBe(2);

        // Force seed
        const forced = await request(app).post('/api/seed?force=true');
        expect(forced.status).toBe(200);
        expect(forced.body.totals.studentsCreated).toBe(2);

        // Verify still only 2 students in the database
        const parentUser = await database
          .collection('users')
          .findOne({ email: 'test.parent@example.com' });
        const students = await database
          .collection('students')
          .find({ userId: parentUser!._id })
          .toArray();
        expect(students).toHaveLength(2);
      });

      it('should delete and recreate payments when force=true', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.paymentsCreated).toBe(2);

        const forced = await request(app).post('/api/seed?force=true');
        expect(forced.status).toBe(200);
        expect(forced.body.totals.paymentsCreated).toBe(2);
      });

      it('should delete and recreate subscriptions when force=true', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.subscriptionsCreated).toBe(1);

        const forced = await request(app).post('/api/seed?force=true');
        expect(forced.status).toBe(200);
        expect(forced.body.totals.subscriptionsCreated).toBe(1);
      });

      it('should delete and recreate audit logs when force=true', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.auditLogsCreated).toBe(1);

        const forced = await request(app).post('/api/seed?force=true');
        expect(forced.status).toBe(200);
        expect(forced.body.totals.auditLogsCreated).toBe(1);
      });

      it('should delete and recreate communication logs when force=true', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.communicationsCreated).toBe(1);

        const forced = await request(app).post('/api/seed?force=true');
        expect(forced.status).toBe(200);
        expect(forced.body.totals.communicationsCreated).toBe(1);
      });

      it('should not treat force=false as force mode', async () => {
        const first = await request(app).post('/api/seed');
        expect(first.status).toBe(200);
        expect(first.body.totals.usersCreated).toBe(3);

        // force=false should behave like no force
        const second = await request(app).post('/api/seed?force=false');
        expect(second.status).toBe(200);
        expect(second.body.totals.usersCreated).toBe(0);
        expect(second.body.totals.usersExisting).toBe(3);
      });
    });

    describe('alerts linked to correct entities', () => {
      it('should associate alerts with the parent user id', async () => {
        await request(app).post('/api/seed');

        const parentUser = await database
          .collection('users')
          .findOne({ email: 'test.parent@example.com' });
        expect(parentUser).not.toBeNull();

        const alerts = await database
          .collection('alerts')
          .find({ userId: parentUser!._id.toString() })
          .toArray();

        expect(alerts.length).toBeGreaterThanOrEqual(2);
      });

      it('should associate alerts with the first student', async () => {
        await request(app).post('/api/seed');

        const parentUser = await database
          .collection('users')
          .findOne({ email: 'test.parent@example.com' });
        expect(parentUser).not.toBeNull();

        const students = await database
          .collection('students')
          .find({ userId: parentUser!._id })
          .toArray();

        expect(students.length).toBeGreaterThan(0);

        // The seed route uses the first student from findByUserId
        const firstStudent = students[0];
        expect(firstStudent).toBeDefined();

        const alerts = await database
          .collection('alerts')
          .find({ studentId: firstStudent!._id.toString() })
          .toArray();

        expect(alerts.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('alert relatedData', () => {
      it('should store MISSING_ASSIGNMENT alert with relatedData fields', async () => {
        await request(app).post('/api/seed');

        const alert = await database.collection('alerts').findOne({ type: 'MISSING_ASSIGNMENT' });

        expect(alert).not.toBeNull();
        const relatedData = alert!['relatedData'] as Record<string, unknown>;
        expect(relatedData).toBeDefined();
        expect(relatedData['assignmentName']).toBe('Math homework');
        expect(relatedData['points']).toBe(25);
        expect(relatedData['dueDate']).toBeDefined();
      });

      it('should store GRADE_DROP alert with relatedData fields', async () => {
        await request(app).post('/api/seed');

        const alert = await database.collection('alerts').findOne({ type: 'GRADE_DROP' });

        expect(alert).not.toBeNull();
        const relatedData = alert!['relatedData'] as Record<string, unknown>;
        expect(relatedData).toBeDefined();
        expect(relatedData['courseName']).toBe('Science');
        expect(relatedData['previousGrade']).toBe(90);
        expect(relatedData['currentGrade']).toBe(80);
        expect(relatedData['dropPercentage']).toBe(10);
      });
    });
  });
});
