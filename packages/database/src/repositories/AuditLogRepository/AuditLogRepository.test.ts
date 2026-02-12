import { MongoClient, type Db } from 'mongodb';
import { AuditLogRepository } from './AuditLogRepository';
import { AuditLog, type IAuditLogData } from '../../models/AuditLog';

describe('AuditLogRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: AuditLogRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new AuditLogRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('audit_logs').deleteMany({});
  });

  describe('create', () => {
    it('should create audit log entry', async () => {
      const logData: IAuditLogData = {
        adminUserId: '507f1f77bcf86cd799439011',
        adminEmail: 'admin@test.com',
        action: 'customer:view',
        entityType: 'customer',
        entityId: '507f1f77bcf86cd799439012',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };

      const log = await repository.create(logData);

      expect(log).toBeInstanceOf(AuditLog);
      expect(log.adminUserId).toBe('507f1f77bcf86cd799439011');
      expect(log.action).toBe('customer:view');
      expect(log._id).toBeDefined();
    });

    it('should set default severity based on action', async () => {
      const logData: IAuditLogData = {
        adminUserId: '507f1f77bcf86cd799439011',
        adminEmail: 'admin@test.com',
        action: 'customer:delete',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      };

      const log = await repository.create(logData);
      expect(log.severity).toBe('critical');
    });
  });

  describe('findByAdminUserId', () => {
    it('should find logs by admin user id', async () => {
      const adminId = '507f1f77bcf86cd799439011';
      await repository.create({
        adminUserId: adminId,
        adminEmail: 'admin@test.com',
        action: 'customer:view',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await repository.create({
        adminUserId: adminId,
        adminEmail: 'admin@test.com',
        action: 'customer:edit',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      const logs = await repository.findByAdminUserId(adminId);

      expect(logs.length).toBe(2);
    });

    it('should return logs in descending order', async () => {
      const adminId = '507f1f77bcf86cd799439011';
      await repository.create({
        adminUserId: adminId,
        adminEmail: 'admin@test.com',
        action: 'customer:view',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date('2024-01-01'),
      });
      await repository.create({
        adminUserId: adminId,
        adminEmail: 'admin@test.com',
        action: 'customer:edit',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date('2024-01-02'),
      });

      const logs = await repository.findByAdminUserId(adminId);
      expect(logs.length).toBeGreaterThanOrEqual(2);
      if (logs[0] && logs[1]) {
        expect(logs[0].timestamp.getTime()).toBeGreaterThanOrEqual(logs[1].timestamp.getTime());
      }
    });
  });

  describe('findByEntity', () => {
    it('should find logs by entity type and id', async () => {
      const entityId = '507f1f77bcf86cd799439012';
      await repository.create({
        adminUserId: '507f1f77bcf86cd799439011',
        adminEmail: 'admin@test.com',
        action: 'customer:view',
        entityType: 'customer',
        entityId,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      const logs = await repository.findByEntity('customer', entityId);

      expect(logs.length).toBe(1);
      if (logs[0]) {
        expect(logs[0].entityId).toBe(entityId);
      }
    });
  });

  describe('findByAction', () => {
    it('should find logs by action type', async () => {
      await repository.create({
        adminUserId: '507f1f77bcf86cd799439011',
        adminEmail: 'admin@test.com',
        action: 'customer:view',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });
      await repository.create({
        adminUserId: '507f1f77bcf86cd799439011',
        adminEmail: 'admin@test.com',
        action: 'customer:edit',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      });

      const logs = await repository.findByAction('customer:view');

      expect(logs.length).toBe(1);
      if (logs[0]) {
        expect(logs[0].action).toBe('customer:view');
      }
    });
  });

  describe('findByDateRange', () => {
    it('should find logs in date range', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await repository.create({
        adminUserId: '507f1f77bcf86cd799439011',
        adminEmail: 'admin@test.com',
        action: 'customer:view',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date('2024-01-15'),
      });
      await repository.create({
        adminUserId: '507f1f77bcf86cd799439011',
        adminEmail: 'admin@test.com',
        action: 'customer:edit',
        entityType: 'customer',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        timestamp: new Date('2024-02-15'), // Outside range
      });

      const logs = await repository.findByDateRange(startDate, endDate);

      expect(logs.length).toBe(1);
    });
  });

  describe('findWithPagination', () => {
    it('should paginate results', async () => {
      // Create multiple logs
      for (let i = 0; i < 15; i++) {
        await repository.create({
          adminUserId: '507f1f77bcf86cd799439011',
          adminEmail: 'admin@test.com',
          action: 'customer:view',
          entityType: 'customer',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        });
      }

      const page1 = await repository.findWithPagination({ page: 1, limit: 10 });
      expect(page1.data.length).toBe(10);
      expect(page1.total).toBe(15);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBe(2);

      const page2 = await repository.findWithPagination({ page: 2, limit: 10 });
      expect(page2.data.length).toBe(5);
      expect(page2.page).toBe(2);
    });
  });
});
