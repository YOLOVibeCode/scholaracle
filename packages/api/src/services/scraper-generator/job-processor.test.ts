import { MongoClient, type Db } from 'mongodb';
import { processScraperGenerationJob, isKnownPlatform } from './job-processor';

// ---------------------------------------------------------------------------
// Mock all external dependencies (ISP: each mock is a single concern)
// ---------------------------------------------------------------------------

jest.mock('./crawler', () => ({
  connectStep: jest.fn(),
  crawlStep: jest.fn(),
  authenticateCheckStep: jest.fn(),
}));

jest.mock('./ai-generator', () => ({
  generateScraperWithAI: jest.fn(),
}));

jest.mock('./validator', () => ({
  validateGeneratedScraper: jest.fn(),
}));

import { connectStep, crawlStep, authenticateCheckStep } from './crawler';
import { generateScraperWithAI } from './ai-generator';
import { validateGeneratedScraper } from './validator';

const mockConnect = connectStep as jest.MockedFunction<typeof connectStep>;
const mockCrawl = crawlStep as jest.MockedFunction<typeof crawlStep>;
const mockAuthCheck = authenticateCheckStep as jest.MockedFunction<typeof authenticateCheckStep>;
const mockGenerate = generateScraperWithAI as jest.MockedFunction<typeof generateScraperWithAI>;
const mockValidate = validateGeneratedScraper as jest.MockedFunction<typeof validateGeneratedScraper>;

// ---------------------------------------------------------------------------
// Realistic mock data
// ---------------------------------------------------------------------------

function makeRealisticCrawlResult() {
  return {
    ok: true,
    title: 'PowerSchool Login',
    loginForm: {
      emailField: '#fieldAccount',
      passwordField: '#fieldPassword',
      submitButton: '#btn-enter',
      formAction: '/guardian/home.html',
      method: 'post',
    },
    navigation: [{ text: 'Help', href: '/help' }],
    detectedFramework: undefined,
    pageHtml: '<html><body><form>...</form></body></html>',
  };
}

function makeRealisticGenerated() {
  return {
    scraperCode: `
import { chromium } from 'playwright';
export default class PowerSchoolScraper {
  async initialize(config) { this.config = config; }
  async authenticate() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(this.config.loginUrl);
    await page.fill('#fieldAccount', this.config.credentials.username);
    await page.fill('#fieldPassword', this.config.credentials.password);
    await page.click('#btn-enter');
    return { success: true };
  }
  async scrape() { return { courses: [] }; }
  transform(raw) { return [{ op: 'upsert', entity: 'course', key: { provider: 'ps', adapterId: 'ps-browser', externalId: '1' }, observedAt: new Date().toISOString(), record: { title: 'Math' } }]; }
  async cleanup() { if (this.browser) await this.browser.close(); }
}`,
    transformerCode: `
export type ISlcDeltaOp = { op: string; entity: string; key: unknown; observedAt: string; record: unknown };
export function transformPowerSchoolExtract(raw) { return []; }`,
    metadata: JSON.stringify({ id: 'powerschool-browser', name: 'PowerSchool', version: '1.0.0' }),
  };
}

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

let mongoClient: MongoClient;
let db: Db;

beforeAll(async () => {
  const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
  mongoClient = new MongoClient(uri);
  await mongoClient.connect();
  db = mongoClient.db('scholaracle_job_processor_test');
});

afterAll(async () => {
  await db.dropDatabase();
  await mongoClient.close();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await db.collection('scraper_generation_jobs').deleteMany({});
  await db.collection('generated_scrapers').deleteMany({});
});

// ---------------------------------------------------------------------------
// Helper: seed a queued job
// ---------------------------------------------------------------------------

async function seedJob(jobId: string, overrides: Record<string, unknown> = {}) {
  const now = new Date();
  await db.collection('scraper_generation_jobs').insertOne({
    jobId,
    userId: 'user-1',
    platformName: 'PowerSchool',
    loginUrl: 'https://powerschool.example.com/login',
    cacheKey: 'abc123',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    steps: [
      { name: 'connect', status: 'pending', details: null },
      { name: 'crawl', status: 'pending', details: null },
      { name: 'authenticate_check', status: 'pending', details: null },
      { name: 'generate', status: 'pending', details: null },
      { name: 'validate', status: 'pending', details: null },
    ],
    result: null,
    error: null,
    retryCount: 0,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('isKnownPlatform', () => {
  it('recognizes canvas, aeries, skyward', () => {
    expect(isKnownPlatform('Canvas')).toBe(true);
    expect(isKnownPlatform('AERIES')).toBe(true);
    expect(isKnownPlatform('skyward')).toBe(true);
  });

  it('rejects unknown platforms', () => {
    expect(isKnownPlatform('PowerSchool')).toBe(false);
    expect(isKnownPlatform('Schoology')).toBe(false);
  });
});

describe('processScraperGenerationJob', () => {
  describe('happy path', () => {
    it('transitions queued -> ready and caches the result', async () => {
      await seedJob('job-happy');

      mockConnect.mockResolvedValue({ ok: true, httpStatus: 200, responseTimeMs: 150, sslValid: true });
      mockCrawl.mockResolvedValue(makeRealisticCrawlResult());
      mockAuthCheck.mockResolvedValue({ ok: true, loginFormUsable: true, captchaDetected: false, mfaRequired: false, loginMethod: 'email_password' });
      mockGenerate.mockResolvedValue(makeRealisticGenerated());
      mockValidate.mockReturnValue({ valid: true, errors: [] });

      await processScraperGenerationJob(db, 'job-happy');

      const job = await db.collection('scraper_generation_jobs').findOne({ jobId: 'job-happy' });
      expect(job?.['status']).toBe('ready');
      const result = job?.['result'] as { scraperCode?: string; transformerCode?: string } | undefined;
      expect(result?.scraperCode).toContain('PowerSchoolScraper');
      expect(result?.transformerCode).toContain('ISlcDeltaOp');
      expect(job?.['error']).toBeNull();

      const cached = await db.collection('generated_scrapers').findOne({ cacheKey: 'abc123' });
      expect(cached).toBeTruthy();
      expect(cached?.['platformName']).toBe('PowerSchool');
      expect(cached?.['scraperCode']).toContain('chromium');
    });

    it('calls each pipeline step in order', async () => {
      await seedJob('job-order');

      mockConnect.mockResolvedValue({ ok: true, httpStatus: 200, responseTimeMs: 50, sslValid: true });
      mockCrawl.mockResolvedValue(makeRealisticCrawlResult());
      mockAuthCheck.mockResolvedValue({ ok: true, loginFormUsable: true, captchaDetected: false, mfaRequired: false });
      mockGenerate.mockResolvedValue(makeRealisticGenerated());
      mockValidate.mockReturnValue({ valid: true, errors: [] });

      await processScraperGenerationJob(db, 'job-order');

      expect(mockConnect).toHaveBeenCalledWith('https://powerschool.example.com/login');
      expect(mockCrawl).toHaveBeenCalledWith('https://powerschool.example.com/login');
      expect(mockAuthCheck).toHaveBeenCalled();
      expect(mockGenerate).toHaveBeenCalled();
      expect(mockValidate).toHaveBeenCalled();

      const callOrder = [mockConnect, mockCrawl, mockAuthCheck, mockGenerate, mockValidate];
      for (let i = 0; i < callOrder.length - 1; i++) {
        expect(callOrder[i]!.mock.invocationCallOrder[0]).toBeLessThan(
          callOrder[i + 1]!.mock.invocationCallOrder[0]!
        );
      }
    });
  });

  describe('failure paths', () => {
    it('fails if connect step returns ok: false', async () => {
      await seedJob('job-connect-fail');
      mockConnect.mockResolvedValue({ ok: false, error: 'ECONNREFUSED' });

      await processScraperGenerationJob(db, 'job-connect-fail');

      const job = await db.collection('scraper_generation_jobs').findOne({ jobId: 'job-connect-fail' });
      expect(job?.['status']).toBe('failed');
      expect(job?.['error']).toContain('ECONNREFUSED');
      expect(mockCrawl).not.toHaveBeenCalled();
    });

    it('fails if crawl finds no login form', async () => {
      await seedJob('job-crawl-fail');
      mockConnect.mockResolvedValue({ ok: true, httpStatus: 200, responseTimeMs: 50, sslValid: true });
      mockCrawl.mockResolvedValue({ ok: false, title: 'Home Page', error: 'Could not find a login form at this URL' });

      await processScraperGenerationJob(db, 'job-crawl-fail');

      const job = await db.collection('scraper_generation_jobs').findOne({ jobId: 'job-crawl-fail' });
      expect(job?.['status']).toBe('failed');
      expect(job?.['error']).toContain('login form');
      expect(mockAuthCheck).not.toHaveBeenCalled();
    });

    it('fails if CAPTCHA is detected', async () => {
      await seedJob('job-captcha');
      mockConnect.mockResolvedValue({ ok: true, httpStatus: 200, responseTimeMs: 50, sslValid: true });
      mockCrawl.mockResolvedValue(makeRealisticCrawlResult());
      mockAuthCheck.mockResolvedValue({ ok: false, captchaDetected: true, error: 'Login requires CAPTCHA' });

      await processScraperGenerationJob(db, 'job-captcha');

      const job = await db.collection('scraper_generation_jobs').findOne({ jobId: 'job-captcha' });
      expect(job?.['status']).toBe('failed');
      expect(job?.['error']).toContain('CAPTCHA');
      expect(mockGenerate).not.toHaveBeenCalled();
    });

    it('fails if AI generation throws', async () => {
      await seedJob('job-ai-fail');
      mockConnect.mockResolvedValue({ ok: true, httpStatus: 200, responseTimeMs: 50, sslValid: true });
      mockCrawl.mockResolvedValue(makeRealisticCrawlResult());
      mockAuthCheck.mockResolvedValue({ ok: true, loginFormUsable: true, captchaDetected: false, mfaRequired: false });
      mockGenerate.mockRejectedValue(new Error('ANTHROPIC_API_KEY not set'));

      await processScraperGenerationJob(db, 'job-ai-fail');

      const job = await db.collection('scraper_generation_jobs').findOne({ jobId: 'job-ai-fail' });
      expect(job?.['status']).toBe('failed');
      expect(job?.['error']).toContain('ANTHROPIC_API_KEY');
    });

    it('fails if generated code fails validation', async () => {
      await seedJob('job-validate-fail');
      mockConnect.mockResolvedValue({ ok: true, httpStatus: 200, responseTimeMs: 50, sslValid: true });
      mockCrawl.mockResolvedValue(makeRealisticCrawlResult());
      mockAuthCheck.mockResolvedValue({ ok: true, loginFormUsable: true, captchaDetected: false, mfaRequired: false });
      mockGenerate.mockResolvedValue({ scraperCode: '// too short', transformerCode: '', metadata: '' });
      mockValidate.mockReturnValue({ valid: false, errors: ['Scraper code is missing or too short', 'Transformer code is missing'] });

      await processScraperGenerationJob(db, 'job-validate-fail');

      const job = await db.collection('scraper_generation_jobs').findOne({ jobId: 'job-validate-fail' });
      expect(job?.['status']).toBe('failed');
      expect(job?.['error']).toContain('validation');
    });
  });

  describe('edge cases', () => {
    it('does nothing if job is not in queued status', async () => {
      await seedJob('job-already-done', { status: 'ready' });

      await processScraperGenerationJob(db, 'job-already-done');

      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('does nothing if job does not exist', async () => {
      await processScraperGenerationJob(db, 'nonexistent');
      expect(mockConnect).not.toHaveBeenCalled();
    });
  });
});
