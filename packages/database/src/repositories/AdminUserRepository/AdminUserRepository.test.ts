import { MongoClient, type Db } from 'mongodb';
import { AdminUserRepository } from './AdminUserRepository';
import { AdminUser, type IAdminUserData } from '../../models/AdminUser';

describe('AdminUserRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: AdminUserRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new AdminUserRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_users').deleteMany({});
  });

  describe('create', () => {
    it('should create admin user', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
      const adminData: IAdminUserData = {
        email: 'admin@test.com',
        passwordHash,
        name: 'Test Admin',
        role: 'admin',
      };

      const admin = await repository.create(adminData);

      expect(admin).toBeInstanceOf(AdminUser);
      expect(admin.email).toBe('admin@test.com');
      expect(admin.name).toBe('Test Admin');
      expect(admin.role).toBe('admin');
      expect(admin._id).toBeDefined();
    });

    it('should set default values', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
      const adminData: IAdminUserData = {
        email: 'admin2@test.com',
        passwordHash,
        name: 'Test Admin 2',
        role: 'support',
      };

      const admin = await repository.create(adminData);

      expect(admin.isActive).toBe(true);
      expect(admin.mfaEnabled).toBe(false);
      expect(admin.permissions).toEqual(expect.any(Array));
      expect(admin.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('findByEmail', () => {
    it('should find admin by email', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
      const adminData: IAdminUserData = {
        email: 'find@test.com',
        passwordHash,
        name: 'Find Admin',
        role: 'admin',
      };

      await repository.create(adminData);
      const found = await repository.findByEmail('find@test.com');

      expect(found).not.toBeNull();
      expect(found?.email).toBe('find@test.com');
    });

    it('should return null when admin not found', async () => {
      const found = await repository.findByEmail('nonexistent@test.com');
      expect(found).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find admin by id', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
      const adminData: IAdminUserData = {
        email: 'findid@test.com',
        passwordHash,
        name: 'Find ID Admin',
        role: 'admin',
      };

      const created = await repository.create(adminData);
      const found = await repository.findById(created._id!.toString());

      expect(found).not.toBeNull();
      expect(found?._id?.toString()).toBe(created._id?.toString());
    });

    it('should return null when admin not found', async () => {
      const found = await repository.findById('507f1f77bcf86cd799439011');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update admin user', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
      const adminData: IAdminUserData = {
        email: 'update@test.com',
        passwordHash,
        name: 'Update Admin',
        role: 'admin',
      };

      const created = await repository.create(adminData);
      const updated = await repository.update(created._id!.toString(), {
        name: 'Updated Name',
        isActive: false,
      });

      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.isActive).toBe(false);
    });

    it('should update last login', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
      const adminData: IAdminUserData = {
        email: 'login@test.com',
        passwordHash,
        name: 'Login Admin',
        role: 'admin',
      };

      const created = await repository.create(adminData);
      const loginTime = new Date();
      const updated = await repository.updateLastLogin(created._id!.toString(), loginTime);

      expect(updated).not.toBeNull();
      expect(updated?.lastLogin).toEqual(loginTime);
    });
  });

  describe('deactivate', () => {
    it('should deactivate admin user', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
      const adminData: IAdminUserData = {
        email: 'deactivate@test.com',
        passwordHash,
        name: 'Deactivate Admin',
        role: 'admin',
      };

      const created = await repository.create(adminData);
      const isDeactivated = await repository.deactivate(created._id!.toString());

      expect(isDeactivated).toBe(true);
      const found = await repository.findById(created._id!.toString());
      expect(found?.isActive).toBe(false);
    });
  });

  describe('findAll', () => {
    it('should list all admins', async () => {
      const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
      await repository.create({
        email: 'admin1@test.com',
        passwordHash,
        name: 'Admin 1',
        role: 'admin',
      });
      await repository.create({
        email: 'admin2@test.com',
        passwordHash,
        name: 'Admin 2',
        role: 'support',
      });

      const admins = await repository.findAll();

      expect(admins.length).toBe(2);
    });

    it('should return empty array when no admins', async () => {
      const admins = await repository.findAll();
      expect(admins.length).toBe(0);
    });
  });
});
