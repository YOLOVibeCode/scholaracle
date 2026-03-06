// Mock Firebase Admin before imports
jest.mock('firebase-admin', () => {
  const mockSend = jest.fn().mockResolvedValue('fcm-message-id');

  return {
    __esModule: true,
    messaging: jest.fn(() => ({
      send: mockSend,
    })),
    initializeApp: jest.fn(),
  };
});

// Mock SendGrid
jest.mock('@sendgrid/mail', () => {
  return {
    __esModule: true,
    default: {
      setApiKey: jest.fn(),
      send: jest.fn().mockResolvedValue([
        {
          statusCode: 202,
          body: { message_id: 'email-123' },
        },
      ]),
    },
  };
});

// Mock Twilio
jest.mock('twilio', () => {
  return {
    __esModule: true,
    default: jest.fn(() => ({
      messages: {
        create: jest.fn().mockResolvedValue({
          sid: 'sms-123',
          status: 'queued',
        }),
      },
    })),
  };
});

import { startWorker, type IWorkerConfig } from './worker';
import { MongoClient, type Db, type Collection } from 'mongodb';

// Helper to trigger shutdown and wait
async function triggerShutdown(signal: 'SIGTERM' | 'SIGINT' = 'SIGTERM'): Promise<void> {
  process.emit(signal, signal as unknown as NodeJS.Signals);
  await new Promise((resolve) => setTimeout(resolve, 150));
}

describe('Worker', () => {
  let mockMongoClient: jest.Mocked<MongoClient>;
  let mockDb: jest.Mocked<Db>;
  let mockCollection: jest.Mocked<Collection>;
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Use port 0 so each test gets a random free port and avoids EADDRINUSE when run in parallel
    process.env['PORT'] = '0';
    mockCollection = {
      createIndex: jest.fn().mockResolvedValue('index-name'),
      insertOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) }),
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<Collection>;

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    } as unknown as jest.Mocked<Db>;

    mockMongoClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      db: jest.fn().mockReturnValue(mockDb),
    } as unknown as jest.Mocked<MongoClient>;

    jest.spyOn(MongoClient.prototype, 'connect').mockImplementation(mockMongoClient.connect);
    jest.spyOn(MongoClient.prototype, 'close').mockImplementation(mockMongoClient.close);
    jest.spyOn(MongoClient.prototype, 'db').mockImplementation(mockMongoClient.db);

    // Prevent process.exit from terminating tests
    jest.spyOn(process, 'exit').mockImplementation((() => {}) as never);

    // Save env vars we might touch
    for (const key of [
      'MONGODB_URI',
      'MONGODB_DB_NAME',
      'SENDGRID_API_KEY',
      'SENDGRID_FROM_EMAIL',
      'SENDGRID_FROM_NAME',
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_FROM_NUMBER',
    ]) {
      savedEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Restore env vars
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
  });

  // -------------------------------------------------------------------------
  // Startup & connection
  // -------------------------------------------------------------------------

  describe('startWorker', () => {
    it('should connect to MongoDB and start worker', async () => {
      await startWorker({ mongodbUri: 'mongodb://localhost:27017' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMongoClient.connect).toHaveBeenCalled();

      await triggerShutdown();
    });

    it('should use environment variables when config not provided', async () => {
      process.env['MONGODB_URI'] = 'mongodb://test:27017';
      process.env['SENDGRID_API_KEY'] = 'SG.test';

      await startWorker();
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMongoClient.connect).toHaveBeenCalled();

      await triggerShutdown();
    });

    it('should fall back to default MongoDB URI when neither config nor env is set', async () => {
      delete process.env['MONGODB_URI'];

      await startWorker({});
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Default is mongodb://localhost:27017
      expect(mockMongoClient.connect).toHaveBeenCalled();

      await triggerShutdown();
    });

    it('should use default database name "scholaracle" when env not set', async () => {
      delete process.env['MONGODB_DB_NAME'];

      await startWorker({ mongodbUri: 'mongodb://localhost:27017' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMongoClient.db).toHaveBeenCalledWith('scholaracle');

      await triggerShutdown();
    });

    it('should use MONGODB_DB_NAME env var when set', async () => {
      process.env['MONGODB_DB_NAME'] = 'test_db';

      await startWorker({ mongodbUri: 'mongodb://localhost:27017' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockMongoClient.db).toHaveBeenCalledWith('test_db');

      await triggerShutdown();
    });
  });

  // -------------------------------------------------------------------------
  // Config resolution
  // -------------------------------------------------------------------------

  describe('config resolution', () => {
    it('should accept custom pollIntervalMs and concurrency', async () => {
      const config: IWorkerConfig = {
        mongodbUri: 'mongodb://localhost:27017',
        pollIntervalMs: 5000,
        concurrency: 3,
      };

      // Should not throw
      await startWorker(config);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockMongoClient.connect).toHaveBeenCalled();

      await triggerShutdown();
    });

    it('should accept custom SendGrid config values', async () => {
      const config: IWorkerConfig = {
        mongodbUri: 'mongodb://localhost:27017',
        sendGridApiKey: 'SG.custom-key',
        sendGridFromEmail: 'custom@example.com',
        sendGridFromName: 'CustomApp',
      };

      await startWorker(config);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockMongoClient.connect).toHaveBeenCalled();

      await triggerShutdown();
    });

    it('should accept custom Twilio config values', async () => {
      const config: IWorkerConfig = {
        mongodbUri: 'mongodb://localhost:27017',
        twilioAccountSid: 'AC-test-sid',
        twilioAuthToken: 'test-auth-token',
        twilioFromNumber: '+15551234567',
      };

      await startWorker(config);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockMongoClient.connect).toHaveBeenCalled();

      await triggerShutdown();
    });

    it('should fall back to SendGrid env vars when config omitted', async () => {
      process.env['SENDGRID_API_KEY'] = 'SG.env-key';
      process.env['SENDGRID_FROM_EMAIL'] = 'env@example.com';
      process.env['SENDGRID_FROM_NAME'] = 'EnvApp';

      await startWorker({ mongodbUri: 'mongodb://localhost:27017' });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockMongoClient.connect).toHaveBeenCalled();

      await triggerShutdown();
    });

    it('should fall back to Twilio env vars when config omitted', async () => {
      process.env['TWILIO_ACCOUNT_SID'] = 'AC-env-sid';
      process.env['TWILIO_AUTH_TOKEN'] = 'env-auth-token';
      process.env['TWILIO_FROM_NUMBER'] = '+15559999999';

      await startWorker({ mongodbUri: 'mongodb://localhost:27017' });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(mockMongoClient.connect).toHaveBeenCalled();

      await triggerShutdown();
    });
  });

  // -------------------------------------------------------------------------
  // Graceful shutdown
  // -------------------------------------------------------------------------

  describe('graceful shutdown', () => {
    it('should close MongoDB connection on SIGTERM', async () => {
      await startWorker({ mongodbUri: 'mongodb://localhost:27017' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      await triggerShutdown('SIGTERM');

      expect(mockMongoClient.close).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should close MongoDB connection on SIGINT', async () => {
      await startWorker({ mongodbUri: 'mongodb://localhost:27017' });
      await new Promise((resolve) => setTimeout(resolve, 100));

      await triggerShutdown('SIGINT');

      expect(mockMongoClient.close).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('should reject when MongoDB connection fails', async () => {
      const connectError = new Error('Connection refused');
      mockMongoClient.connect.mockRejectedValue(connectError);

      await expect(startWorker({ mongodbUri: 'mongodb://bad-host:27017' })).rejects.toThrow(
        'Connection refused'
      );
    });
  });
});
