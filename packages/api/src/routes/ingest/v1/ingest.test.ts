import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { StudentRepository } from '@scholaracle/database';
import { ingestV1Router } from './ingest';

describe('Ingest v1 API', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let userToken: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    // Clean collections used by ingest
    await database.collection('users').deleteMany({ email: 'slc-user@test.com' });
    await database.collection('slc_device_auth').deleteMany({});
    await database.collection('slc_sources').deleteMany({});
    await database.collection('slc_runs').deleteMany({});
    await database.collection('slc_assignments').deleteMany({});
    await database.collection('slc_event_series').deleteMany({});
    await database.collection('slc_event_overrides').deleteMany({});
    await database.collection('slc_courses').deleteMany({});
    await database.collection('slc_grade_snapshots').deleteMany({});
    await database.collection('slc_attendance_events').deleteMany({});
    await database.collection('slc_academic_terms').deleteMany({});
    await database.collection('slc_institutions').deleteMany({});
    await database.collection('slc_teachers').deleteMany({});
    await database.collection('slc_course_materials').deleteMany({});
    await database.collection('slc_messages').deleteMany({});
    await database.collection('slc_student_profiles').deleteMany({});
    await database.collection('students').deleteMany({});

    authService = new AuthService(database, 'test-secret');
    const reg = await authService.register('slc-user@test.com', 'password123', 'SLC User');
    if (!reg.success || !reg.token) throw new Error('Failed to register test user');
    userToken = reg.token;

    app = express();
    app.use(express.json());
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  it('supports device flow and ingestion run', async () => {
    // Start device flow
    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    expect(start.status).toBe(200);
    expect(start.body.deviceCode).toBeDefined();
    expect(start.body.userCode).toBeDefined();

    const deviceCode = start.body.deviceCode as string;
    const userCode = start.body.userCode as string;

    // Approve with user JWT
    const approve = await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode });
    expect(approve.status).toBe(200);

    // Poll and receive connector token
    const poll1 = await request(app).post('/api/ingest/v1/device/poll').send({ deviceCode });
    expect(poll1.status).toBe(200);
    expect(poll1.body.status).toBe('approved');
    expect(poll1.body.connectorToken).toBeDefined();

    const connectorToken = poll1.body.connectorToken as string;

    // Register source
    const source = await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-1',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Test Source',
        portalBaseUrl: 'https://example.edu',
      });
    expect(source.status).toBe(200);

    // Start run
    const run = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-1' });
    expect(run.status).toBe(200);
    expect(run.body.runId).toBeDefined();

    const runId = run.body.runId as string;

    // Upload delta envelope with assignment + eventSeries
    const now = new Date().toISOString();
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'test',
        adapterId: 'com.test.adapter',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Los_Angeles',
      },
      source: {
        sourceId: 'src-1',
        displayName: 'Test Source',
        portalBaseUrl: 'https://example.edu',
      },
      ops: [
        {
          op: 'upsert',
          entity: 'assignment',
          key: {
            provider: 'test',
            adapterId: 'com.test.adapter',
            externalId: 'a-1',
            studentExternalId: 'stu-1',
            institutionExternalId: 'inst-1',
            courseExternalId: 'course-1',
          },
          observedAt: now,
          record: {
            title: 'HW 1',
            dueAt: now,
            status: 'missing',
            pointsPossible: 10,
            pointsEarned: 0,
          },
        },
        {
          op: 'upsert',
          entity: 'eventSeries',
          key: {
            provider: 'test',
            adapterId: 'com.test.adapter',
            externalId: 'series-1',
            studentExternalId: 'stu-1',
            institutionExternalId: 'inst-1',
          },
          observedAt: now,
          record: {
            title: 'Weekly Quiz',
            category: 'quiz',
            timezone: 'America/Los_Angeles',
            startsAt: '2025-09-05T08:00:00',
            endsAt: '2025-09-05T08:30:00',
            recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=FR', count: 3 },
          },
        },
      ],
    };

    const upload = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(upload.status).toBe(200);

    const complete = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/complete`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ cursor: { type: 'opaque', value: 'cursor-1' } });
    expect(complete.status).toBe(200);

    // Verify persisted entities
    const assignmentCount = await database.collection('slc_assignments').countDocuments({});
    expect(assignmentCount).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Helper: perform full device flow and return a connector token
  // ---------------------------------------------------------------------------
  async function getConnectorToken(): Promise<string> {
    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    const deviceCode = start.body.deviceCode as string;
    const userCode = start.body.userCode as string;
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode });
    const poll = await request(app).post('/api/ingest/v1/device/poll').send({ deviceCode });
    return poll.body.connectorToken as string;
  }

  // ---------------------------------------------------------------------------
  // 1. Poll with missing deviceCode
  // ---------------------------------------------------------------------------
  it('returns 400 on poll with missing deviceCode', async () => {
    const res = await request(app).post('/api/ingest/v1/device/poll').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/deviceCode/i);
  });

  // ---------------------------------------------------------------------------
  // 2. Poll with non-existent deviceCode
  // ---------------------------------------------------------------------------
  it('returns 404 on poll with non-existent deviceCode', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: 'nonexistent' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/expired|not found/i);
  });

  // ---------------------------------------------------------------------------
  // 3. Approve with missing userCode
  // ---------------------------------------------------------------------------
  it('returns 400 on approve with missing userCode', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/userCode/i);
  });

  // ---------------------------------------------------------------------------
  // 4. Approve without auth
  // ---------------------------------------------------------------------------
  it('returns 401 on approve without auth', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/device/approve')
      .send({ userCode: 'AAAA-BBBB' });
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 5. Source registration with missing fields
  // ---------------------------------------------------------------------------
  it('returns 404 for GET /sources/:sourceId/credentials when source not found or no credentials', async () => {
    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    expect(start.status).toBe(200);
    const deviceCode = start.body.deviceCode as string;
    const userCode = start.body.userCode as string;
    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode });
    const poll = await request(app).post('/api/ingest/v1/device/poll').send({ deviceCode });
    expect(poll.status).toBe(200);
    const connectorToken = poll.body.connectorToken as string;

    const res = await request(app)
      .get('/api/ingest/v1/sources/non-existent-source-id/credentials')
      .set('Authorization', `Bearer ${connectorToken}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not found|no credentials/i);
  });

  it('returns 400 on source registration with missing fields', async () => {
    const connectorToken = await getConnectorToken();
    const res = await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/missing required fields/i);
  });

  // ---------------------------------------------------------------------------
  // 6. List sources for authenticated connector
  // ---------------------------------------------------------------------------
  it('lists sources for authenticated connector', async () => {
    const connectorToken = await getConnectorToken();

    // Register a source first
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-list-test',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'List Test Source',
        portalBaseUrl: 'https://example.edu',
      });

    // List sources and verify
    const res = await request(app)
      .get('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.sources)).toBe(true);
    const found = res.body.sources.find(
      (s: { sourceId?: string }) => s.sourceId === 'src-list-test'
    );
    expect(found).toBeDefined();
    expect(found.displayName).toBe('List Test Source');
  });

  // ---------------------------------------------------------------------------
  // 6b. GET /connector/students requires connector auth
  // ---------------------------------------------------------------------------
  it('returns 401 for GET /connector/students without connector auth', async () => {
    const res = await request(app).get('/api/ingest/v1/connector/students');
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 6c. GET /connector/students returns students with dataSources
  // ---------------------------------------------------------------------------
  it('returns students with dataSources for authenticated connector', async () => {
    const userDoc = await database.collection('users').findOne({ email: 'slc-user@test.com' });
    if (!userDoc?._id) throw new Error('Test user not found');
    const userId = userDoc._id as ObjectId;

    const studentRepo = new StudentRepository(database);
    await studentRepo.create({
      userId,
      name: 'Emma Lewis',
      grade: 7,
      studentId: 'stu-emma-1',
      dataSources: [{ id: 'src-connector-students', pluginId: 'canvas', enabled: true }],
    });

    const connectorToken = await getConnectorToken();
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-connector-students',
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Canvas LMS',
        portalBaseUrl: 'https://lincoln.instructure.com',
      });

    const res = await request(app)
      .get('/api/ingest/v1/connector/students')
      .set('Authorization', `Bearer ${connectorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const emma = res.body.find((s: { name?: string }) => s.name === 'Emma Lewis');
    expect(emma).toBeDefined();
    expect(emma.externalId).toBe('stu-emma-1');
    expect(emma.grade).toBe(7);
    expect(Array.isArray(emma.dataSources)).toBe(true);
    const ds = emma.dataSources.find(
      (d: { sourceId?: string }) => d.sourceId === 'src-connector-students'
    );
    expect(ds).toBeDefined();
    expect(ds.provider).toBe('canvas');
    expect(ds.displayName).toBe('Canvas LMS');
    expect(ds.portalBaseUrl).toBe('https://lincoln.instructure.com');
  });

  // ---------------------------------------------------------------------------
  // 7. Start run with missing sourceId
  // ---------------------------------------------------------------------------
  it('returns 400 on start run with missing sourceId', async () => {
    const connectorToken = await getConnectorToken();
    const res = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sourceId/i);
  });

  // ---------------------------------------------------------------------------
  // 8. Validates envelope successfully
  // ---------------------------------------------------------------------------
  it('validates envelope successfully', async () => {
    const connectorToken = await getConnectorToken();

    // Start a run so we have a valid runId
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-validate',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Validate Source',
        portalBaseUrl: 'https://example.edu',
      });

    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-validate' });
    const runId = runRes.body.runId as string;

    const now = new Date().toISOString();
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'test',
        adapterId: 'com.test.adapter',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Los_Angeles',
      },
      source: {
        sourceId: 'src-validate',
        displayName: 'Validate Source',
        portalBaseUrl: 'https://example.edu',
      },
      ops: [
        {
          op: 'upsert',
          entity: 'assignment',
          key: {
            provider: 'test',
            adapterId: 'com.test.adapter',
            externalId: 'a-validate',
            studentExternalId: 'stu-1',
            institutionExternalId: 'inst-1',
            courseExternalId: 'course-1',
          },
          observedAt: now,
          record: {
            title: 'Validate HW',
            dueAt: now,
            status: 'submitted',
            pointsPossible: 10,
            pointsEarned: 8,
          },
        },
      ],
    };

    const res = await request(app)
      .post('/api/ingest/v1/validate')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(res.status).toBe(200);
    expect(res.body.validated).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 9. Rejects invalid envelope on validate
  // ---------------------------------------------------------------------------
  it('rejects invalid envelope on validate', async () => {
    const connectorToken = await getConnectorToken();
    const res = await request(app)
      .post('/api/ingest/v1/validate')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ schemaVersion: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.validated).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // 10. Envelope with runId mismatch
  // ---------------------------------------------------------------------------
  it('returns 400 on envelope with runId mismatch', async () => {
    const connectorToken = await getConnectorToken();

    // Register source and start a run
    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-mismatch',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Mismatch Source',
        portalBaseUrl: 'https://example.edu',
      });

    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-mismatch' });
    const runId = runRes.body.runId as string;

    const now = new Date().toISOString();
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId: 'wrong-run-id',
        startedAt: now,
        provider: 'test',
        adapterId: 'com.test.adapter',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Los_Angeles',
      },
      source: {
        sourceId: 'src-mismatch',
        displayName: 'Mismatch Source',
        portalBaseUrl: 'https://example.edu',
      },
      ops: [
        {
          op: 'upsert',
          entity: 'assignment',
          key: {
            provider: 'test',
            adapterId: 'com.test.adapter',
            externalId: 'a-mismatch',
            studentExternalId: 'stu-1',
            institutionExternalId: 'inst-1',
            courseExternalId: 'course-1',
          },
          observedAt: now,
          record: {
            title: 'Mismatch HW',
            dueAt: now,
            status: 'submitted',
            pointsPossible: 10,
            pointsEarned: 5,
          },
        },
      ],
    };

    const res = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('runId mismatch');
  });

  // ---------------------------------------------------------------------------
  // 11. Persists all entity types (not just assignment/eventSeries/eventOverride)
  // ---------------------------------------------------------------------------
  it('persists all 12 entity types through envelope upload', async () => {
    const connectorToken = await getConnectorToken();

    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-all-entities',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'All Entities Source',
      });

    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-all-entities' });
    const runId = runRes.body.runId as string;

    const now = new Date().toISOString();
    const baseKey = {
      provider: 'test',
      adapterId: 'com.test.adapter',
      studentExternalId: 'stu-all',
      institutionExternalId: 'inst-all',
    };

    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'test',
        adapterId: 'com.test.adapter',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Chicago',
      },
      source: { sourceId: 'src-all-entities', displayName: 'All Entities Source' },
      ops: [
        {
          op: 'upsert',
          entity: 'assignment',
          key: { ...baseKey, externalId: 'a-all-1', courseExternalId: 'c-1' },
          observedAt: now,
          record: {
            title: 'HW All',
            status: 'graded',
            pointsPossible: 100,
            pointsEarned: 95,
            description: 'Full desc',
            category: 'Homework',
          },
        },
        {
          op: 'upsert',
          entity: 'course',
          key: { ...baseKey, externalId: 'c-1' },
          observedAt: now,
          record: {
            title: 'AP Math',
            courseCode: 'MATH-301',
            teacherName: 'Mrs. Johnson',
            period: '3rd',
            room: 'B204',
          },
        },
        {
          op: 'upsert',
          entity: 'gradeSnapshot',
          key: { ...baseKey, externalId: 'gs-1', courseExternalId: 'c-1' },
          observedAt: now,
          record: {
            courseExternalId: 'c-1',
            asOfDate: '2026-02-16',
            letterGrade: 'A',
            percentGrade: 95.5,
            missingCount: 0,
          },
        },
        {
          op: 'upsert',
          entity: 'attendanceEvent',
          key: { ...baseKey, externalId: 'att-1' },
          observedAt: now,
          record: {
            date: '2026-02-14',
            status: 'present',
            periodName: '1st',
            courseName: 'AP Math',
          },
        },
        {
          op: 'upsert',
          entity: 'academicTerm',
          key: { ...baseKey, externalId: 'term-1' },
          observedAt: now,
          record: {
            title: 'Spring 2026',
            startDate: '2026-01-13',
            endDate: '2026-05-22',
            type: 'semester',
          },
        },
        {
          op: 'upsert',
          entity: 'institution',
          key: { ...baseKey, externalId: 'inst-all' },
          observedAt: now,
          record: { name: 'Lake Dallas High School', type: 'school' },
        },
        {
          op: 'upsert',
          entity: 'teacher',
          key: { ...baseKey, externalId: 'teacher-1' },
          observedAt: now,
          record: { name: 'Mrs. Johnson', email: 'johnson@school.edu', department: 'Mathematics' },
        },
        {
          op: 'upsert',
          entity: 'courseMaterial',
          key: { ...baseKey, externalId: 'mat-1', courseExternalId: 'c-1' },
          observedAt: now,
          record: {
            title: 'Study Guide',
            courseExternalId: 'c-1',
            type: 'study_guide',
            url: 'https://example.com/sg.pdf',
          },
        },
        {
          op: 'upsert',
          entity: 'message',
          key: { ...baseKey, externalId: 'msg-1' },
          observedAt: now,
          record: {
            subject: 'Conference',
            body: 'Please attend.',
            senderName: 'Mrs. Johnson',
            sentAt: now,
            importance: 'important',
          },
        },
        {
          op: 'upsert',
          entity: 'studentProfile',
          key: { ...baseKey, externalId: 'profile-1' },
          observedAt: now,
          record: {
            name: 'Emma Lewis',
            gradeLevel: '10th',
            school: 'Lake Dallas HS',
            studentId: '12345',
          },
        },
        {
          op: 'upsert',
          entity: 'eventSeries',
          key: { ...baseKey, externalId: 'es-all-1' },
          observedAt: now,
          record: {
            title: 'Quiz',
            category: 'quiz',
            timezone: 'America/Chicago',
            startsAt: '2026-03-01T09:00:00',
            recurrence: { rrule: 'FREQ=WEEKLY;BYDAY=FR', count: 3 },
          },
        },
        {
          op: 'upsert',
          entity: 'eventOverride',
          key: { ...baseKey, externalId: 'eo-all-1' },
          observedAt: now,
          record: {
            seriesExternalId: 'es-all-1',
            occurrenceStartAt: '2026-03-08T09:00:00',
            op: 'cancel',
          },
        },
      ],
    };

    const upload = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(upload.status).toBe(200);
    expect(upload.body.accepted).toBe(true);

    // Verify each entity type was persisted in its collection
    const entityCollectionMap: Record<string, string> = {
      assignment: 'slc_assignments',
      course: 'slc_courses',
      gradeSnapshot: 'slc_grade_snapshots',
      attendanceEvent: 'slc_attendance_events',
      academicTerm: 'slc_academic_terms',
      institution: 'slc_institutions',
      teacher: 'slc_teachers',
      courseMaterial: 'slc_course_materials',
      message: 'slc_messages',
      studentProfile: 'slc_student_profiles',
      eventSeries: 'slc_event_series',
      eventOverride: 'slc_event_overrides',
    };

    for (const [, collectionName] of Object.entries(entityCollectionMap)) {
      const count = await database.collection(collectionName).countDocuments({
        provider: 'test',
        adapterId: 'com.test.adapter',
      });
      expect(count).toBeGreaterThan(0);
    }

    // Verify enriched fields are stored in the record
    const storedCourse = await database.collection('slc_courses').findOne({
      externalId: 'c-1',
      provider: 'test',
    });
    expect(storedCourse).toBeDefined();
    const courseRecord = storedCourse?.['record'] as Record<string, unknown> | undefined;
    expect(courseRecord?.['title']).toBe('AP Math');
    expect(courseRecord?.['period']).toBe('3rd');
    expect(courseRecord?.['room']).toBe('B204');

    const storedProfile = await database.collection('slc_student_profiles').findOne({
      externalId: 'profile-1',
      provider: 'test',
    });
    expect(storedProfile).toBeDefined();
    const profileRecord = storedProfile?.['record'] as Record<string, unknown> | undefined;
    expect(profileRecord?.['name']).toBe('Emma Lewis');
    expect(profileRecord?.['gradeLevel']).toBe('10th');

    const storedGrade = await database.collection('slc_grade_snapshots').findOne({
      externalId: 'gs-1',
      provider: 'test',
    });
    expect(storedGrade).toBeDefined();
    const gradeRecord = storedGrade?.['record'] as Record<string, unknown> | undefined;
    expect(gradeRecord?.['percentGrade']).toBe(95.5);
    expect(gradeRecord?.['missingCount']).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 12. Delete ops remove entities (soft-delete)
  // ---------------------------------------------------------------------------
  it('soft-deletes entities via delete ops', async () => {
    const connectorToken = await getConnectorToken();

    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-delete-test',
        provider: 'test',
        adapterId: 'com.test.adapter',
        displayName: 'Delete Test',
      });

    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-delete-test' });
    const runId = runRes.body.runId as string;

    const now = new Date().toISOString();
    const baseKey = {
      provider: 'test',
      adapterId: 'com.test.adapter',
      studentExternalId: 'stu-del',
      institutionExternalId: 'inst-del',
    };

    // First upsert a course, then delete it
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: 'test',
        adapterId: 'com.test.adapter',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Chicago',
      },
      source: { sourceId: 'src-delete-test', displayName: 'Delete Test' },
      ops: [
        {
          op: 'upsert',
          entity: 'course',
          key: { ...baseKey, externalId: 'course-del-1' },
          observedAt: now,
          record: { title: 'To Be Deleted' },
        },
        {
          op: 'delete',
          entity: 'course',
          key: { ...baseKey, externalId: 'course-del-1' },
          observedAt: now,
        },
      ],
    };

    const upload = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/envelope`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);
    expect(upload.status).toBe(200);

    // The course should exist but with a deletedAt timestamp
    const doc = await database.collection('slc_courses').findOne({
      externalId: 'course-del-1',
      provider: 'test',
    });
    expect(doc).toBeDefined();
    expect(doc?.['deletedAt']).toBeDefined();
    expect(doc?.['deletedAt']).toBeInstanceOf(Date);
  });
});
