import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { resolveModelForRole } from '@scholaracle/agents';
import { AuthService } from '@scholaracle/auth';
import { StudentRepository } from '@scholaracle/database';
import { agendaRouter } from './agenda';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('Agenda API', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let testToken: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    await database.collection('users').deleteMany({ email: 'agenda@test.com' });
    await database.collection('students').deleteMany({ studentId: 'student-ext-1' });
    await database.collection('slc_assignments').deleteMany({});
    await database.collection('slc_event_series').deleteMany({});
    await database.collection('agenda_overrides').deleteMany({});

    authService = new AuthService(database);
    const reg = await authService.register('agenda@test.com', 'password123', 'Agenda User');
    if (!reg.success || !reg.token || !reg.user?.id) {
      throw new Error('Failed to create agenda test user');
    }
    testToken = reg.token;

    // Agenda queries slc_* by student.dataUserId(); assignments without a student never surface.
    const studentRepo = new StudentRepository(database);
    await studentRepo.create({
      userId: reg.user.id,
      name: 'Agenda Student',
      grade: 9,
      studentId: 'student-ext-1',
    });

    app = express();
    app.use(express.json());
    app.use('/api/agenda', agendaRouter({ database }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  it('returns agenda items for range', async () => {
    const now = new Date();
    const inOneDay = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
    const userId =
      (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ??
      'unknown';

    // Insert a course first
    await database.collection('slc_courses').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'course-ext-1',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      termExternalId: 'term-ext-fall',
      deletedAt: null,
      record: { name: 'Algebra I' },
    });

    await database.collection('slc_assignments').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'assignment-1',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      courseExternalId: 'course-ext-1',
      termExternalId: 'term-ext-fall',
      deletedAt: null,
      record: { title: 'HW', dueAt: inOneDay },
    });

    const from = now.toISOString();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();

    const res = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);

    // Verify course name is resolved
    const assignment = res.body.data.items.find((item: any) => item.type === 'assignment');
    expect(assignment).toBeDefined();
    expect(assignment.courseName).toBe('Algebra I');
  });

  /**
   * The model's one-line summaries on agenda items.
   *
   * Where the call goes: every other model call in the API and the workers asks
   * `resolveLlmConfig`, where the Noctusoft relay key wins. Until 26 Nov 2026 this route read
   * ANTHROPIC_API_KEY itself, so with that key set it called the vendor directly, and with
   * only the relay key set (every deployed server) the summaries were silently off.
   *
   * Whether it runs: off unless AGENDA_AI_ENABLED=true. The call is made while the page
   * waits, on every agenda load, so it is turned on per environment on purpose.
   */
  describe('AI summaries', () => {
    const ENV_KEYS = [
      'AGENDA_AI_ENABLED',
      'LITELLM_API_KEY',
      'LITELLM_BASE_URL',
      'ANTHROPIC_API_KEY',
      'AI_API_KEY',
    ];
    const savedEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
    const realFetch = globalThis.fetch;
    const SUMMARY = 'Essay due in two days';
    let userId: string;

    /** Stands in for the relay: answers with a summary for every item id it was sent. */
    function mockModel(): jest.Mock {
      const fetchMock = jest.fn(async (_url: string, init: { body: string }) => {
        const prompt = (JSON.parse(init.body) as { messages: { content: string }[] }).messages
          .map((message) => message.content)
          .join('\n');
        const ids = [...prompt.matchAll(/^id: ([^,]+),/gm)].map((match) => match[1]);
        const items = ids.map((id) => ({ id, importance: 'high', labels: [], aiSummary: SUMMARY }));
        const reply = {
          content: [{ type: 'text', text: JSON.stringify({ items }) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
        return new Response(JSON.stringify(reply), { status: 200 });
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;
      return fetchMock;
    }

    async function getAgenda(): Promise<request.Response> {
      const now = new Date();
      return request(app)
        .get('/api/agenda')
        .query({
          from: now.toISOString(),
          to: new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString(),
        })
        .set('Authorization', `Bearer ${testToken}`);
    }

    function summaries(res: request.Response): (string | undefined)[] {
      return (res.body.data.items as { aiSummary?: string }[]).map((item) => item.aiSummary);
    }

    beforeAll(async () => {
      const user = await database.collection('users').findOne({ email: 'agenda@test.com' });
      userId = user?._id?.toString() ?? 'unknown';
      await database.collection('slc_assignments').insertOne({
        userId,
        provider: 'fixture',
        adapterId: 'com.scholaracle.fixture',
        externalId: 'assignment-ai-1',
        studentExternalId: 'student-ext-1',
        institutionExternalId: 'institution-ext-1',
        courseExternalId: 'course-ext-1',
        termExternalId: 'term-ext-fall',
        deletedAt: null,
        record: {
          title: 'Essay',
          dueAt: new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString(),
        },
      });
    });

    beforeEach(async () => {
      for (const key of ENV_KEYS) delete process.env[key];
      // A plan that includes agenda summaries (the free plan has none).
      await database
        .collection('users')
        .updateOne(
          { email: 'agenda@test.com' },
          { $set: { subscription: { plan: 'family', status: 'active' } } }
        );
      await database.collection('ai_usage').deleteMany({ userId });
    });

    afterEach(() => {
      for (const [key, value] of savedEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      globalThis.fetch = realFetch;
    });

    afterAll(async () => {
      await database
        .collection('users')
        .updateOne({ email: 'agenda@test.com' }, { $unset: { subscription: '' } });
      await database.collection('ai_usage').deleteMany({ userId });
    });

    it('asks the relay, with the relay key, even when a direct vendor key is also set', async () => {
      process.env['AGENDA_AI_ENABLED'] = 'true';
      process.env['LITELLM_API_KEY'] = 'fake-relay-key';
      process.env['LITELLM_BASE_URL'] = 'https://relay.test';
      process.env['ANTHROPIC_API_KEY'] = 'fake-vendor-key';
      const fetchMock = mockModel();

      const res = await getAgenda();

      expect(res.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
      expect(url).toBe('https://relay.test/v1/messages');
      expect(init.headers['x-api-key']).toBe('fake-relay-key');
    });

    it('asks the relay when the relay key is the only key, as on every deployed server', async () => {
      process.env['AGENDA_AI_ENABLED'] = 'true';
      process.env['LITELLM_API_KEY'] = 'fake-relay-key';
      const fetchMock = mockModel();

      const res = await getAgenda();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url] = fetchMock.mock.calls[0] as [string];
      expect(url).toBe('https://ai.noctusoft.com/v1/messages');
      expect(summaries(res)).toContain(SUMMARY);
    });

    it('uses the small model set for the job, not the client default', async () => {
      process.env['AGENDA_AI_ENABLED'] = 'true';
      process.env['LITELLM_API_KEY'] = 'fake-relay-key';
      const fetchMock = mockModel();

      await getAgenda();

      const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
      expect((JSON.parse(init.body) as { model: string }).model).toBe(
        resolveModelForRole('triage')
      );
    });

    it('counts one use against the plan for each call it makes', async () => {
      process.env['AGENDA_AI_ENABLED'] = 'true';
      process.env['LITELLM_API_KEY'] = 'fake-relay-key';
      mockModel();

      await getAgenda();

      expect(await database.collection('ai_usage').countDocuments({ userId })).toBe(1);
    });

    it('stays off until it is switched on, with the relay key set (how it runs today)', async () => {
      process.env['LITELLM_API_KEY'] = 'fake-relay-key';
      process.env['ANTHROPIC_API_KEY'] = 'fake-vendor-key';
      const fetchMock = mockModel();

      const res = await getAgenda();

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(summaries(res).filter(Boolean)).toEqual([]);
      expect(await database.collection('ai_usage').countDocuments({ userId })).toBe(0);
    });

    it.each(['false', '0', '', 'on-ish'])('stays off when the switch is %p', async (value) => {
      process.env['AGENDA_AI_ENABLED'] = value;
      process.env['LITELLM_API_KEY'] = 'fake-relay-key';
      const fetchMock = mockModel();

      await getAgenda();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('makes no model call when it is switched on but no key is set', async () => {
      process.env['AGENDA_AI_ENABLED'] = 'true';
      const fetchMock = mockModel();

      const res = await getAgenda();

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('makes no model call on a plan without agenda summaries', async () => {
      process.env['AGENDA_AI_ENABLED'] = 'true';
      process.env['LITELLM_API_KEY'] = 'fake-relay-key';
      await database
        .collection('users')
        .updateOne({ email: 'agenda@test.com' }, { $unset: { subscription: '' } });
      const fetchMock = mockModel();

      const res = await getAgenda();

      expect(res.status).toBe(200);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('still returns the agenda when the relay fails', async () => {
      process.env['AGENDA_AI_ENABLED'] = 'true';
      process.env['LITELLM_API_KEY'] = 'fake-relay-key';
      const fetchMock = jest.fn(async () => new Response('upstream down', { status: 502 }));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const res = await getAgenda();

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(summaries(res).filter(Boolean)).toEqual([]);
    });
  });

  it('returns 400 when from/to params missing', async () => {
    const res = await request(app).get('/api/agenda').set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Missing from/to ISO timestamps');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns empty items when no assignments exist', async () => {
    // Use a date range far in the past where no data exists
    const from = new Date('2000-01-01T00:00:00.000Z').toISOString();
    const to = new Date('2000-01-02T00:00:00.000Z').toISOString();

    const res = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toEqual([]);
  });

  it('includes event series occurrences in agenda', async () => {
    const userId =
      (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ??
      'unknown';

    const now = new Date();
    const startsAt = new Date(now.getTime() + 24 * 60 * 60_000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60_000);

    await database.collection('slc_event_series').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'series-1',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      deletedAt: null,
      record: {
        title: 'Weekly Quiz',
        category: 'quiz',
        timezone: 'America/Los_Angeles',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        recurrence: { rrule: 'FREQ=WEEKLY;COUNT=4', count: 4 },
      },
    });

    const from = now.toISOString();
    const to = new Date(now.getTime() + 30 * 24 * 60 * 60_000).toISOString();

    const res = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const eventOccurrences = res.body.data.items.filter(
      (item: any) => item.type === 'event_occurrence'
    );
    expect(eventOccurrences.length).toBeGreaterThan(0);
    expect(eventOccurrences[0].title).toBe('Weekly Quiz');
  });

  it('snoozes an agenda item', async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString();

    const res = await request(app)
      .post('/api/agenda/snooze')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        itemType: 'assignment',
        itemKey: 'test-key',
        snoozedUntil: futureDate,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.snoozedUntil).toBeDefined();
  });

  it('returns 400 when snooze fields missing', async () => {
    const res = await request(app)
      .post('/api/agenda/snooze')
      .set('Authorization', `Bearer ${testToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Missing itemType/itemKey/snoozedUntil');
  });

  it('filters out snoozed assignments', async () => {
    const userId =
      (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ??
      'unknown';

    const now = new Date();
    const dueAt = new Date(now.getTime() + 2 * 24 * 60 * 60_000).toISOString();
    const from = now.toISOString();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();

    // Insert an assignment due within the query window
    await database.collection('slc_assignments').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'assignment-snooze-test',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      courseExternalId: 'course-ext-1',
      termExternalId: 'term-ext-fall',
      deletedAt: null,
      record: { title: 'Snoozeable HW', dueAt },
    });

    // Verify it appears in the agenda
    const resBefore = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(resBefore.status).toBe(200);
    const beforeItems = resBefore.body.data.items.filter(
      (item: any) => item.title === 'Snoozeable HW'
    );
    expect(beforeItems.length).toBe(1);

    // Compute the item key (base64url of userId|provider|adapterId|externalId|dueAt)
    const itemKey = Buffer.from(
      `${userId}|fixture|com.scholaracle.fixture|assignment-snooze-test|${dueAt}`
    ).toString('base64url');

    // Snooze the assignment
    const snoozeRes = await request(app)
      .post('/api/agenda/snooze')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        itemType: 'assignment',
        itemKey,
        snoozedUntil: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
      });

    expect(snoozeRes.status).toBe(200);
    expect(snoozeRes.body.success).toBe(true);

    // GET /api/agenda again - the snoozed item should be filtered out
    const resAfter = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(resAfter.status).toBe(200);
    const afterItems = resAfter.body.data.items.filter(
      (item: any) => item.title === 'Snoozeable HW'
    );
    expect(afterItems.length).toBe(0);
  });

  it('does not include aiSummary for a free-plan user (no subscription)', async () => {
    const userId =
      (await database.collection('users').findOne({ email: 'agenda@test.com' }))?._id?.toString() ??
      'unknown';

    // Ensure user has no subscription (defaults to free plan — 0 AI agenda uses)
    await database.collection('subscriptions').deleteMany({ userId });
    await database
      .collection('users')
      .updateOne(
        { _id: new (await import('mongodb')).ObjectId(userId) },
        { $unset: { subscription: '' } }
      );

    const now = new Date();
    const dueAt = new Date(now.getTime() + 2 * 24 * 60 * 60_000).toISOString();
    await database.collection('slc_assignments').insertOne({
      userId,
      provider: 'fixture',
      adapterId: 'com.scholaracle.fixture',
      externalId: 'assignment-ai-test',
      studentExternalId: 'student-ext-1',
      institutionExternalId: 'institution-ext-1',
      courseExternalId: 'course-ext-1',
      termExternalId: 'term-ext-fall',
      deletedAt: null,
      record: { title: 'AI-Free HW', dueAt },
    });

    const from = now.toISOString();
    const to = new Date(now.getTime() + 7 * 24 * 60 * 60_000).toISOString();

    const res = await request(app)
      .get('/api/agenda')
      .query({ from, to })
      .set('Authorization', `Bearer ${testToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const aiItem = res.body.data.items.find((i: any) => i.title === 'AI-Free HW');
    expect(aiItem).toBeDefined();
    expect(aiItem.aiSummary).toBeUndefined();
  });

  it('returns 503 when reminder service not configured', async () => {
    const res = await request(app)
      .post('/api/agenda/remind')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ itemId: 'item-1', channel: 'email' });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Reminder service');
  });

  it('passes the reminder as structured data so SMS can use its short template', async () => {
    const sendReminder = jest.fn().mockResolvedValue({ success: true, messageId: 'm1' });
    const remindApp = express();
    remindApp.use(express.json());
    remindApp.use(
      '/api/agenda',
      agendaRouter({
        database,
        notificationService: { sendReminder } as unknown as Parameters<
          typeof agendaRouter
        >[0]['notificationService'],
      })
    );
    remindApp.use(createErrorHandler());
    await database.collection('communication_logs').deleteMany({ relatedEntityId: 'item-sms-1' });

    const res = await request(remindApp)
      .post('/api/agenda/remind')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        itemId: 'item-sms-1',
        channel: 'email',
        title: 'Field trip form',
        studentName: 'Emma',
        timeAt: '2026-10-14T17:00:00.000Z',
      });

    expect(res.status).toBe(200);
    expect(sendReminder).toHaveBeenCalledWith(
      'agenda@test.com',
      'email',
      'Scholarmancy: Field trip form',
      expect.any(String),
      {
        triggerData: expect.objectContaining({
          title: 'Field trip form',
          studentName: 'Emma',
          timeAt: '2026-10-14T17:00:00.000Z',
        }),
      }
    );
  });
});
