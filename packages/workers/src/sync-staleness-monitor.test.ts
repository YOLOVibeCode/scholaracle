import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import type { IEmailTransport } from '@scholaracle/agents';
import {
  SyncStalenessMonitor,
  buildSyncStalenessConfigFromEnv,
  isDataSourceStale,
  latestSyncDate,
} from './sync-staleness-monitor';

const TWENTY_FOUR_H_MS = 24 * 60 * 60_000;

describe('sync staleness (lastSuccessAt)', () => {
  it('treats a source with lastSuccessAt within the 48h window as fresh', () => {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60_000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
    const isStale = isDataSourceStale({ lastSuccessAt: oneHourAgo }, staleThreshold);
    expect(isStale).toBe(false);
  });

  it('treats missing lastSuccessAt as stale', () => {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60_000);
    expect(isDataSourceStale({}, staleThreshold)).toBe(true);
  });

  it('latestSyncDate walks lastSuccess and lastScraped when lastSuccessAt is absent', () => {
    const scraped = new Date('2024-06-01T00:00:00.000Z');
    expect(latestSyncDate({ lastScraped: scraped })?.toISOString()).toBe(scraped.toISOString());
    const success = new Date('2024-06-02T00:00:00.000Z');
    expect(latestSyncDate({ lastSuccess: success, lastScraped: scraped })?.toISOString()).toBe(
      success.toISOString()
    );
  });

  it('isDataSourceStale when only lastScraped is older than threshold', () => {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60_000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60_000);
    expect(isDataSourceStale({ lastScraped: tenDaysAgo }, staleThreshold)).toBe(true);
  });

  it('prefers lastSuccessAt over a stale lastScraped', () => {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60_000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60_000);
    const isStale = isDataSourceStale(
      { lastSuccessAt: oneHourAgo, lastScraped: tenDaysAgo },
      staleThreshold
    );
    expect(isStale).toBe(false);
  });
});

describe('buildSyncStalenessConfigFromEnv', () => {
  it('parses STALENESS_ENABLED=false as disabled', () => {
    expect(buildSyncStalenessConfigFromEnv({ STALENESS_ENABLED: 'false' }).enabled).toBe(false);
    expect(buildSyncStalenessConfigFromEnv({ STALENESS_ENABLED: '0' }).enabled).toBe(false);
    expect(buildSyncStalenessConfigFromEnv({ STALENESS_ENABLED: 'no' }).enabled).toBe(false);
  });

  it('defaults to enabled when STALENESS_ENABLED is unset', () => {
    expect(buildSyncStalenessConfigFromEnv({}).enabled).toBe(true);
  });

  it('reads STALENESS_INTERVAL_MS with fallback to STALENESS_CHECK_INTERVAL_MS', () => {
    expect(
      buildSyncStalenessConfigFromEnv({ STALENESS_INTERVAL_MS: '120000' }).checkIntervalMs
    ).toBe(120_000);
    expect(
      buildSyncStalenessConfigFromEnv({ STALENESS_CHECK_INTERVAL_MS: '900000' }).checkIntervalMs
    ).toBe(900_000);
    expect(
      buildSyncStalenessConfigFromEnv({
        STALENESS_INTERVAL_MS: '60000',
        STALENESS_CHECK_INTERVAL_MS: '900000',
      }).checkIntervalMs
    ).toBe(60_000);
  });

  it('reads STALENESS_INITIAL_DELAY_MS', () => {
    expect(
      buildSyncStalenessConfigFromEnv({ STALENESS_INITIAL_DELAY_MS: '5000' }).initialDelayMs
    ).toBe(5_000);
  });

  it('uses defaults when env interval values are not numbers', () => {
    const cfg = buildSyncStalenessConfigFromEnv({
      STALENESS_INTERVAL_MS: 'not-a-number',
      STALENESS_THRESHOLD_MS: '',
    });
    expect(cfg.checkIntervalMs).toBe(60 * 60_000);
    expect(cfg.staleThresholdMs).toBe(48 * 60 * 60_000);
  });
});

describe('SyncStalenessMonitor', () => {
  describe('start scheduling', () => {
    let mockDb: Db;
    let mockTransport: IEmailTransport;

    beforeEach(() => {
      mockDb = { collection: jest.fn() } as unknown as Db;
      mockTransport = { send: jest.fn().mockResolvedValue(undefined) };
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('does not schedule timers when disabled', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      const monitor = new SyncStalenessMonitor(mockDb, mockTransport, {
        enabled: false,
        fromEmail: 'a@test.com',
        fromName: 'Test',
      });
      monitor.start();

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('schedules initial delay and interval when enabled', () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const setIntervalSpy = jest.spyOn(global, 'setInterval').mockReturnValue(1 as never);

      const monitor = new SyncStalenessMonitor(mockDb, mockTransport, {
        enabled: true,
        initialDelayMs: 5_000,
        checkIntervalMs: 60_000,
        fromEmail: 'a@test.com',
        fromName: 'Test',
      });
      monitor.start();

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5_000);
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
      monitor.stop();
    });
  });

  describe('runCheck', () => {
    jest.setTimeout(60_000);
    let mongoServer: MongoMemoryServer;
    let client: MongoClient;
    let database: Db;
    let mockTransport: IEmailTransport;

    beforeAll(async () => {
      mongoServer = await MongoMemoryServer.create();
      client = new MongoClient(mongoServer.getUri());
      await client.connect();
      database = client.db('staleness-monitor-test');
    });

    afterAll(async () => {
      await client.close();
      await mongoServer.stop();
    });

    beforeEach(async () => {
      mockTransport = { send: jest.fn().mockResolvedValue(undefined) };
      await database.collection('students').deleteMany({});
      await database.collection('users').deleteMany({});
    });

    async function seedOwnerAndStudent(params: {
      readonly ownerId: ObjectId;
      readonly lastSuccessAt: Date;
      readonly studentName: string;
      readonly lastScraped?: Date;
    }): Promise<void> {
      await database.collection('users').insertOne({
        _id: params.ownerId,
        email: 'parent@test.com',
        name: 'Casey',
      });
      await database.collection('students').insertOne({
        _id: new ObjectId(),
        userId: params.ownerId,
        name: params.studentName,
        dataSources: [
          {
            id: 'src-1',
            displayName: 'Canvas',
            enabled: true,
            lastSuccessAt: params.lastSuccessAt,
            ...(params.lastScraped !== undefined ? { lastScraped: params.lastScraped } : {}),
          },
        ],
      });
    }

    it('sends no email when source synced 1 hour ago', async () => {
      const ownerId = new ObjectId();
      const oneHourAgo = new Date(Date.now() - 60 * 60_000);
      await seedOwnerAndStudent({ ownerId, lastSuccessAt: oneHourAgo, studentName: 'Avery' });

      const monitor = new SyncStalenessMonitor(database, mockTransport, {
        staleThresholdMs: TWENTY_FOUR_H_MS,
        fromEmail: 'from@test.com',
        fromName: 'Scholaracle',
      });
      await monitor.runCheck();

      expect(mockTransport.send).not.toHaveBeenCalled();
    });

    it('sends one email when source synced 3 days ago with escaped student name in html', async () => {
      const ownerId = new ObjectId();
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000);
      const studentName = 'Pat <Young>';
      await seedOwnerAndStudent({ ownerId, lastSuccessAt: threeDaysAgo, studentName });

      const monitor = new SyncStalenessMonitor(database, mockTransport, {
        staleThresholdMs: TWENTY_FOUR_H_MS,
        fromEmail: 'from@test.com',
        fromName: 'Scholaracle',
      });
      await monitor.runCheck();

      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const payload = (mockTransport.send as jest.Mock).mock.calls[0]![0] as {
        html: string;
        text: string;
      };
      expect(payload.html).toContain('Pat &lt;Young&gt;');
      expect(payload.html).not.toContain('<strong>Pat <Young></strong>');
      expect(payload.text).toContain('open the app');
    });
  });
});
