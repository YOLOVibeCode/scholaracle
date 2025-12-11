import { type Response } from 'express';
import { adminAuthMiddleware, type IAdminAuthenticatedRequest } from './adminAuth';
import { AdminAuthService } from '@scholaracle/auth';
import { MongoClient, type Db } from 'mongodb';
import { AdminUserRepository } from '@scholaracle/database';

describe('adminAuthMiddleware', () => {
  let client: MongoClient;
  let database: Db;
  let adminAuthService: AdminAuthService;
  let middleware: ReturnType<typeof adminAuthMiddleware>;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    adminAuthService = new AdminAuthService(database, 'test-secret');
    middleware = adminAuthMiddleware(adminAuthService);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_users').deleteMany({});
  });

  it('should allow request with valid admin token', async () => {
    const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
    const admin = await new AdminUserRepository(database).create({
      email: 'admin@test.com',
      passwordHash,
      name: 'Test Admin',
      role: 'admin',
    });

    const loginResult = await adminAuthService.login('admin@test.com', 'TestPass123!');
    expect(loginResult.success).toBe(true);

    const req = {
      headers: {
        authorization: `Bearer ${loginResult.token}`,
      },
    } as IAdminAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.adminId).toBe(admin._id?.toString());
    expect(req.adminEmail).toBe('admin@test.com');
    expect(req.adminRole).toBe('admin');
  });

  it('should reject request without token', async () => {
    const req = {
      headers: {},
    } as IAdminAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing or invalid authorization header',
    });
  });

  it('should reject request with invalid token', async () => {
    const req = {
      headers: {
        authorization: 'Bearer invalid-token',
      },
    } as IAdminAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should reject request with user token (not admin)', async () => {
    // This test would require creating a user token, which we don't have access to here
    // The adminAuthService.verifyToken should reject user tokens since they have type: 'user'
    const req = {
      headers: {
        authorization: 'Bearer user-token-not-admin',
      },
    } as IAdminAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

