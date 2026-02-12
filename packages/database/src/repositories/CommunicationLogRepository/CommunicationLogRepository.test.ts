import { MongoClient, ObjectId, type Db } from 'mongodb';
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

      const isSuccess = await repository.updateDeliveryStatus(log._id!.toString(), 'delivered');

      expect(isSuccess).toBe(true);
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

  describe('findById', () => {
    it('should find log by id', async () => {
      const log = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'notification',
        content: 'Find me by ID',
        status: 'sent',
        triggeredBy: 'system',
      });

      const found = await repository.findById(log._id!.toString());

      expect(found).toBeInstanceOf(CommunicationLog);
      expect(found?.content).toBe('Find me by ID');
      expect(found?.channel).toBe('email');
      expect(found?._id?.toString()).toBe(log._id!.toString());
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(new ObjectId().toString());

      expect(found).toBeNull();
    });
  });

  describe('filterByType', () => {
    it('should filter by type', async () => {
      await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'notification',
        content: 'Notification 1',
        status: 'sent',
        triggeredBy: 'system',
      });
      await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'marketing',
        content: 'Marketing 1',
        status: 'sent',
        triggeredBy: 'admin',
      });
      await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'sms',
        type: 'notification',
        content: 'Notification 2',
        status: 'delivered',
        triggeredBy: 'system',
      });

      const logs = await repository.filterByType('notification');

      expect(logs.length).toBe(2);
      for (const log of logs) {
        expect(log.type).toBe('notification');
      }
    });
  });

  describe('updateDeliveryStatus - additional statuses', () => {
    it('should set openedAt when status is opened', async () => {
      const log = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'notification',
        content: 'Test opened',
        status: 'sent',
        triggeredBy: 'system',
      });

      const isSuccess = await repository.updateDeliveryStatus(log._id!.toString(), 'opened');

      expect(isSuccess).toBe(true);
      const updated = await repository.findById(log._id!.toString());
      expect(updated?.status).toBe('opened');
      expect(updated?.openedAt).toBeInstanceOf(Date);
    });

    it('should set failedAt when status is failed', async () => {
      const log = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'notification',
        content: 'Test failed',
        status: 'sent',
        triggeredBy: 'system',
      });

      const isSuccess = await repository.updateDeliveryStatus(log._id!.toString(), 'failed');

      expect(isSuccess).toBe(true);
      const updated = await repository.findById(log._id!.toString());
      expect(updated?.status).toBe('failed');
      expect(updated?.failedAt).toBeInstanceOf(Date);
    });

    it('should set clickedAt when status is clicked', async () => {
      const log = await repository.create({
        userId: '507f1f77bcf86cd799439011',
        channel: 'email',
        type: 'notification',
        content: 'Test clicked',
        status: 'sent',
        triggeredBy: 'system',
      });

      const isSuccess = await repository.updateDeliveryStatus(log._id!.toString(), 'clicked');

      expect(isSuccess).toBe(true);
      const updated = await repository.findById(log._id!.toString());
      expect(updated?.status).toBe('clicked');
      expect(updated?.clickedAt).toBeInstanceOf(Date);
    });

    it('should return false for non-existent id', async () => {
      const isSuccess = await repository.updateDeliveryStatus(
        new ObjectId().toString(),
        'delivered'
      );

      expect(isSuccess).toBe(false);
    });
  });
});
