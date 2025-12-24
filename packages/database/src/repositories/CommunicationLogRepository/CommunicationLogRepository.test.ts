import { MongoClient, type Db } from 'mongodb';
import { CommunicationLogRepository } from './CommunicationLogRepository';
import { CommunicationLog, type ICommunicationLogData } from '../../models/CommunicationLog';

describe('CommunicationLogRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: CommunicationLogRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new CommunicationLogRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('communication_logs').deleteMany({});
  });

  describe('create', () => {
    it('should create log entry', async () => {
      const logData: ICommunicationLogData = {
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'notification',
        content: 'Test email',
        status: 'sent',
        triggeredBy: 'system',
      };

      const log = await repository.create(logData);

      expect(log).toBeInstanceOf(CommunicationLog);
      expect(log.content).toBe('Test email');
      expect(log._id).toBeDefined();
    });
  });

  describe('findByUserId', () => {
    it('should find logs by user id', async () => {
      const userId = '507f1f77bcf86cd799439011';
      await repository.create({
        userId,
        channel: 'email',
        type: 'notification',
        content: 'Email 1',
        status: 'sent',
        triggeredBy: 'system',
      });
      await repository.create({
        userId,
        channel: 'sms',
        type: 'alert',
        content: 'SMS 1',
        status: 'delivered',
        triggeredBy: 'system',
      });

      const logs = await repository.findByUserId(userId);

      expect(logs.length).toBe(2);
    });
  });

  describe('updateDeliveryStatus', () => {
    it('should update delivery status', async () => {
      const log = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'sent',
        triggeredBy: 'system',
      });

      const success = await repository.updateDeliveryStatus(log._id!.toString(), 'delivered');

      expect(success).toBe(true);
      const updated = await repository.findById(log._id!.toString());
      expect(updated?.status).toBe('delivered');
    });
  });

  describe('filterByChannel', () => {
    it('should filter by channel', async () => {
      await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'notification',
        content: 'Email',
        status: 'sent',
        triggeredBy: 'system',
      });
      await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'sms',
        type: 'notification',
        content: 'SMS',
        status: 'sent',
        triggeredBy: 'system',
      });

      const logs = await repository.filterByChannel('email');

      expect(logs.length).toBe(1);
      expect(logs[0]?.channel).toBe('email');
    });
  });
});


