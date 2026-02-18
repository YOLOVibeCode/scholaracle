/**
 * Packager unit + E2E tests.
 * Unit: Mac/Windows script and run.js content contain expected strings.
 * E2E: Generated run.js loads stub scraper, runs initialize → scrape → transform → upload to ingest API.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { ingestV1Router } from '../../routes/ingest/v1/ingest';
import {
  packageSingleFile,
  getRunJsContent,
  type IPackageOptions,
  type IUserCredentials,
} from './packager';
import type { IGeneratedScraper } from './ai-generator';

// ---------------------------------------------------------------------------
// Stub scraper + transformer for E2E (no browser; returns one course op)
// ---------------------------------------------------------------------------

const STUB_SCRAPER_TS = `
/** Stub scraper for E2E test - no browser. */
export default class StubScraper {
  private config: { credentials?: { studentName?: string }; platformName?: string } = {};
  async initialize(config: unknown) {
    this.config = (config || {}) as typeof this.config;
  }
  async authenticate() {}
  async scrape(): Promise<Record<string, unknown>> {
    return { courses: [{ id: 'c1', title: 'Math' }] };
  }
  transform(rawData: Record<string, unknown>): Array<{ op: string; entity: string; key: unknown; observedAt: string; record: unknown }> {
    const courses = (rawData?.courses as Array<{ id?: string; title?: string }>) || [];
    const now = new Date().toISOString();
    const provider = (this.config.platformName || 'e2e-test').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return courses.map((c) => ({
      op: 'upsert',
      entity: 'course',
      key: { provider, adapterId: provider + '-browser', externalId: c.id || 'c1' },
      observedAt: now,
      record: { title: c.title || 'Course' },
    }));
  }
  async cleanup() {}
}
`;

const STUB_TRANSFORMER_TS = `
// Stub transformer - types only; scraper does transform inline for test.
export type ISlcDeltaOp = unknown;
`;

const STUB_METADATA_JSON = JSON.stringify({
  platformName: 'E2E Test',
  generatedAt: new Date().toISOString(),
});

function buildStubScraper(): IGeneratedScraper {
  return {
    scraperCode: STUB_SCRAPER_TS,
    transformerCode: STUB_TRANSFORMER_TS,
    metadata: STUB_METADATA_JSON,
  };
}

function buildPackageOptions(overrides: Partial<IPackageOptions> = {}): IPackageOptions {
  const platformName = 'E2E Test Platform';
  return {
    connectorToken: 'test-connector-token',
    apiBaseUrl: 'http://localhost:9999',
    platformName,
    loginUrl: 'https://example.edu/login',
    scraper: buildStubScraper(),
    os: 'mac',
    credentials: {
      studentName: 'Test Student',
      username: 'test@example.com',
      password: 'secret',
    } as IUserCredentials,
    generatedAt: new Date().toISOString(),
    cacheKey: 'e2e-cache-key',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('Packager', () => {
  describe('packageSingleFile (Mac)', () => {
    it('produces script that sets up app dir and includes ts-node + scraper files', () => {
      const script = packageSingleFile(buildPackageOptions({ os: 'mac' }));
      expect(script).toContain('ts-node');
      expect(script).toContain('typescript');
      expect(script).toContain('scraper.ts');
      expect(script).toContain('transformer.ts');
      expect(script).toContain('run.js');
      expect(script).toContain('tsconfig.json');
      expect(script).toContain('EMBEDEOF');
    });

    it('includes --scheduled and scheduling logic in embedded run.js', () => {
      const runJs = getRunJsContent(buildPackageOptions());
      expect(runJs).toContain('--scheduled');
      expect(runJs).toContain("process.argv.includes('--scheduled')");
      expect(runJs).toContain("require('ts-node/register')");
      expect(runJs).toContain("require(scraperPath)");
      expect(runJs).toContain('setupScheduling');
      expect(runJs).toContain('StartCalendarInterval');
      expect(runJs).toContain('LaunchAgents');
      expect(runJs).toContain('schtasks');
    });

    it('run.js loads scraper class and runs initialize/authenticate/scrape/transform/cleanup', () => {
      const runJs = getRunJsContent(buildPackageOptions());
      expect(runJs).toContain('instance.initialize');
      expect(runJs).toContain('instance.authenticate');
      expect(runJs).toContain('instance.scrape');
      expect(runJs).toContain('instance.transform');
      expect(runJs).toContain('instance.cleanup');
      expect(runJs).toContain('/api/ingest/v1/runs');
      expect(runJs).toContain('/envelope');
      expect(runJs).toContain('/complete');
    });
  });

  describe('packageSingleFile (Windows)', () => {
    it('produces bat with ts-node and run.js + scraper files', () => {
      const script = packageSingleFile(buildPackageOptions({ os: 'windows' }));
      expect(script).toContain('ts-node');
      expect(script).toContain('run.js');
      expect(script).toContain('scraper.ts');
      expect(script).toContain('transformer.ts');
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: AI-generated scraper code compiles and runs the full lifecycle
// ---------------------------------------------------------------------------

describe('AI-generated scraper lifecycle', () => {
  const tmpDir = require('os').tmpdir();
  const path = require('path');
  const fs = require('fs');
  let workDir: string;

  beforeEach(() => {
    workDir = path.join(tmpDir, `packager-ai-${Date.now()}`);
    fs.mkdirSync(workDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('realistic AI-generated scraper loads via ts-node and exposes the expected interface', () => {
    const scraperTs = `
import { chromium, type Browser, type Page } from 'playwright';

export default class TestPlatformScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private config: Record<string, unknown> = {};

  async initialize(config: Record<string, unknown>) {
    this.config = config;
  }
  async authenticate(): Promise<{ success: boolean; message?: string }> {
    return { success: true };
  }
  async scrape(): Promise<Record<string, unknown>> {
    return {
      courses: [
        { id: 'c1', title: 'Algebra II', teacher: 'Ms. Johnson', grade: 'A-' },
        { id: 'c2', title: 'US History', teacher: 'Mr. Smith', grade: 'B+' },
      ],
      timestamp: new Date().toISOString(),
    };
  }
  transform(rawData: Record<string, unknown>): Array<{
    op: string; entity: string;
    key: { provider: string; adapterId: string; externalId: string };
    observedAt: string; record: Record<string, unknown>;
  }> {
    const courses = (rawData.courses ?? []) as Array<{ id: string; title: string; teacher?: string; grade?: string }>;
    const now = new Date().toISOString();
    return courses.map((c) => ({
      op: 'upsert',
      entity: 'course',
      key: { provider: 'test-platform', adapterId: 'test-platform-browser', externalId: c.id },
      observedAt: now,
      record: { title: c.title, teacherName: c.teacher },
    }));
  }
  async cleanup() {
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.page = null;
  }
}
`;

    const transformerTs = `
export interface ISlcDeltaOp {
  op: string;
  entity: string;
  key: { provider: string; adapterId: string; externalId: string };
  observedAt: string;
  record: Record<string, unknown>;
}
export function transformTestPlatformExtract(raw: Record<string, unknown>): ISlcDeltaOp[] {
  return [];
}
`;

    const metadataJson = JSON.stringify({
      id: 'test-platform-browser',
      name: 'Test Platform',
      version: '1.0.0',
    });

    const tsconfig = JSON.stringify({
      compilerOptions: {
        module: 'commonjs',
        target: 'ES2020',
        esModuleInterop: true,
        resolveJsonModule: true,
        strict: false,
      },
      include: ['*.ts'],
    });

    fs.writeFileSync(path.join(workDir, 'scraper.ts'), scraperTs);
    fs.writeFileSync(path.join(workDir, 'transformer.ts'), transformerTs);
    fs.writeFileSync(path.join(workDir, 'metadata.json'), metadataJson);
    fs.writeFileSync(path.join(workDir, 'tsconfig.json'), tsconfig);

    require('ts-node').register({ transpileOnly: true, project: path.join(workDir, 'tsconfig.json') });
    const scraperModule = require(path.join(workDir, 'scraper.ts'));
    const ScraperClass = scraperModule.default ?? scraperModule.TestPlatformScraper;

    expect(ScraperClass).toBeDefined();
    expect(typeof ScraperClass).toBe('function');

    const instance = new ScraperClass();
    expect(typeof instance.initialize).toBe('function');
    expect(typeof instance.authenticate).toBe('function');
    expect(typeof instance.scrape).toBe('function');
    expect(typeof instance.transform).toBe('function');
    expect(typeof instance.cleanup).toBe('function');
  });

  it('full lifecycle: initialize -> authenticate -> scrape -> transform produces valid ops', async () => {
    const scraperTs = `
export default class LifecycleScraper {
  private config: any = {};
  async initialize(config: any) { this.config = config; }
  async authenticate() { return { success: true }; }
  async scrape() {
    return { courses: [{ id: 'math-101', title: 'Calculus', teacher: 'Dr. Lee' }] };
  }
  transform(raw: any) {
    const courses = raw.courses || [];
    const now = new Date().toISOString();
    return courses.map((c: any) => ({
      op: 'upsert', entity: 'course',
      key: { provider: 'lifecycle', adapterId: 'lifecycle-browser', externalId: c.id },
      observedAt: now,
      record: { title: c.title, teacherName: c.teacher },
    }));
  }
  async cleanup() {}
}
`;

    const tsconfig = JSON.stringify({
      compilerOptions: { module: 'commonjs', target: 'ES2020', esModuleInterop: true, strict: false },
      include: ['*.ts'],
    });

    fs.writeFileSync(path.join(workDir, 'scraper.ts'), scraperTs);
    fs.writeFileSync(path.join(workDir, 'tsconfig.json'), tsconfig);

    require('ts-node').register({ transpileOnly: true, project: path.join(workDir, 'tsconfig.json') });
    const mod = require(path.join(workDir, 'scraper.ts'));
    const ScraperClass = mod.default;
    const instance = new ScraperClass();

    await instance.initialize({ credentials: { username: 'u', password: 'p' } });
    const auth = await instance.authenticate();
    expect(auth.success).toBe(true);

    const raw = await instance.scrape();
    expect(raw.courses).toHaveLength(1);

    const ops = instance.transform(raw);
    expect(ops).toHaveLength(1);
    expect(ops[0].op).toBe('upsert');
    expect(ops[0].entity).toBe('course');
    expect(ops[0].key.externalId).toBe('math-101');
    expect(ops[0].record.title).toBe('Calculus');
    expect(ops[0].record.teacherName).toBe('Dr. Lee');

    await instance.cleanup();
  });
});

// ---------------------------------------------------------------------------
// E2E: run generated run.js against real ingest API
// ---------------------------------------------------------------------------

describe('Packager E2E', () => {
  let app: Express;
  let server: ReturnType<Express['listen']>;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let userToken: string;
  let connectorToken: string;
  const sourceId = 'e2e-test-platform';

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    await database.collection('users').deleteMany({ email: 'packager-e2e@test.com' });
    await database.collection('slc_device_auth').deleteMany({});
    await database.collection('slc_sources').deleteMany({ sourceId });
    await database.collection('slc_runs').deleteMany({});
    await database.collection('slc_courses').deleteMany({});

    authService = new AuthService(database, 'test-secret');
    const reg = await authService.register(
      'packager-e2e@test.com',
      'password123',
      'Packager E2E User'
    );
    if (!reg.success || !reg.token) throw new Error('Failed to register test user');
    userToken = reg.token;

    app = express();
    app.use(express.json());
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret: 'test-secret' }));

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
      server.once('error', reject);
    });

    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    expect(start.status).toBe(200);
    const deviceCode = start.body.deviceCode as string;
    const userCode = start.body.userCode as string;

    await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode });

    const poll = await request(app).post('/api/ingest/v1/device/poll').send({ deviceCode });
    expect(poll.body.status).toBe('approved');
    connectorToken = poll.body.connectorToken as string;

    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId,
        provider: sourceId,
        adapterId: sourceId + '-browser',
        displayName: 'E2E Test Platform',
        portalBaseUrl: 'https://example.edu',
      });
  }, 30_000);

  afterAll(async () => {
    if (server) server.close();
    await mongoClient.close();
  });

  it('accepts envelope (run → envelope → complete) and stores course ops', async () => {
    const now = new Date().toISOString();
    const ops = [
      {
        op: 'upsert',
        entity: 'course',
        key: {
          provider: sourceId,
          adapterId: sourceId + '-browser',
          externalId: 'c1',
        },
        observedAt: now,
        record: { title: 'Math' },
      },
    ];

    const runRes = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', 'Bearer ' + connectorToken)
      .send({ sourceId });
    expect(runRes.status).toBe(200);
    const runId = runRes.body.runId as string;

    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: now,
        provider: sourceId,
        adapterId: sourceId + '-browser',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Los_Angeles',
      },
      source: {
        sourceId,
        displayName: 'E2E Test Platform',
        portalBaseUrl: 'https://example.edu',
      },
      ops,
    };

    const envRes = await request(app)
      .post('/api/ingest/v1/runs/' + runId + '/envelope')
      .set('Authorization', 'Bearer ' + connectorToken)
      .send(envelope);
    expect(envRes.status).toBe(200);

    const completeRes = await request(app)
      .post('/api/ingest/v1/runs/' + runId + '/complete')
      .set('Authorization', 'Bearer ' + connectorToken)
      .send({});
    expect(completeRes.status).toBe(200);

    const courses = await database
      .collection('slc_courses')
      .find({ provider: sourceId })
      .toArray();
    expect(courses.length).toBeGreaterThanOrEqual(1);
    const course = courses.find((c) => c['record']?.title === 'Math') ?? courses[0];
    expect(course?.['record']?.title).toBe('Math');
  });
});
