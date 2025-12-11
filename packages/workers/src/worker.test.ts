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

import { startWorker } from './worker';
import { MongoClient, type Db, type Collection } from 'mongodb';

describe('Worker', () => {
  let mockMongoClient: jest.Mocked<MongoClient>;
  let mockDb: jest.Mocked<Db>;
  let mockCollection: jest.Mocked<Collection>;

  beforeEach(() => {
    mockCollection = {
      createIndex: jest.fn().mockResolvedValue('index-name'),
      insertOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('startWorker', () => {
    it('should connect to MongoDB and start worker', async () => {
      // Arrange
      const config = {
        mongodbUri: 'mongodb://localhost:27017',
      };

      // Act
      await startWorker(config);

      // Wait a bit for initialization
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(mockMongoClient.connect).toHaveBeenCalled();

      // Cleanup
      process.emit('SIGTERM', 'SIGTERM' as unknown as NodeJS.Signals);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('should use environment variables when config not provided', async () => {
      // Arrange
      process.env['MONGODB_URI'] = 'mongodb://test:27017';
      process.env['SENDGRID_API_KEY'] = 'SG.test';

      // Act
      await startWorker();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(mockMongoClient.connect).toHaveBeenCalled();

      // Cleanup
      delete process.env['MONGODB_URI'];
      delete process.env['SENDGRID_API_KEY'];
      process.emit('SIGTERM', 'SIGTERM' as unknown as NodeJS.Signals);
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
  });
});
