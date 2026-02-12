import { type Response } from 'express';
import { requireAdminStepUp } from './adminStepUp';
import type { IAdminAuthenticatedRequest } from './adminAuth';
import { AdminAuthService } from '@scholaracle/auth';
import { MongoClient, type Db } from 'mongodb';
import { AdminUserRepository } from '@scholaracle/database';

describe('requireAdminStepUp', () => {
  let client: MongoClient;
  let database: Db;
  let adminAuthService: AdminAuthService;
  let middleware: ReturnType<typeof requireAdminStepUp>;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    adminAuthService = new AdminAuthService(database, 'test-secret');
    middleware = requireAdminStepUp({ database, jwtSecret: 'test-secret' });
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_users').deleteMany({});
  });

  it('should pass through when admin has MFA disabled', async () => {
    const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
    const admin = await new AdminUserRepository(database).create({
      email: 'admin@test.com',
      passwordHash,
      name: 'Test Admin',
      role: 'admin',
    });

    const req = {
      headers: {},
      adminId: admin._id?.toString(),
    } as unknown as IAdminAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject when no adminId on request', async () => {
    const req = {
      headers: {},
    } as unknown as IAdminAuthenticatedRequest;

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
      error: 'Unauthorized',
    });
  });

  it('should reject when admin not found', async () => {
    const req = {
      headers: {},
      adminId: '507f1f77bcf86cd799439011',
    } as unknown as IAdminAuthenticatedRequest;

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
      error: 'Unauthorized',
    });
  });

  it('should reject when admin is deactivated', async () => {
    const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
    const repo = new AdminUserRepository(database);
    const admin = await repo.create({
      email: 'deactivated@test.com',
      passwordHash,
      name: 'Deactivated Admin',
      role: 'admin',
    });

    await repo.deactivate(admin._id!.toString());

    const req = {
      headers: {},
      adminId: admin._id?.toString(),
    } as unknown as IAdminAuthenticatedRequest;

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
      error: 'Unauthorized',
    });
  });

  it('should require step-up token when MFA is enabled', async () => {
    const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
    const admin = await new AdminUserRepository(database).create({
      email: 'mfa@test.com',
      passwordHash,
      name: 'MFA Admin',
      role: 'admin',
    });

    // Enable MFA directly in the database
    await database
      .collection('admin_users')
      .updateOne({ _id: admin._id }, { $set: { mfaEnabled: true, mfaSecret: 'TESTSECRET' } });

    const req = {
      headers: {},
      adminId: admin._id?.toString(),
    } as unknown as IAdminAuthenticatedRequest;

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
      error: 'MFA step-up required',
      code: 'MFA_STEP_UP_REQUIRED',
    });
  });

  it('should accept valid step-up token via x-admin-stepup header', async () => {
    const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
    const admin = await new AdminUserRepository(database).create({
      email: 'stepup@test.com',
      passwordHash,
      name: 'StepUp Admin',
      role: 'admin',
    });

    // Enable MFA directly in the database
    await database
      .collection('admin_users')
      .updateOne({ _id: admin._id }, { $set: { mfaEnabled: true, mfaSecret: 'TESTSECRET' } });

    const stepUpToken = await adminAuthService.issueStepUpToken(admin._id!.toString());
    expect(stepUpToken).not.toBeNull();

    const req = {
      headers: {
        'x-admin-stepup': stepUpToken,
      },
      adminId: admin._id?.toString(),
    } as unknown as IAdminAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should reject invalid step-up token', async () => {
    const passwordHash = await AdminUserRepository.hashPassword('TestPass123!');
    const admin = await new AdminUserRepository(database).create({
      email: 'badstepup@test.com',
      passwordHash,
      name: 'BadStepUp Admin',
      role: 'admin',
    });

    // Enable MFA directly in the database
    await database
      .collection('admin_users')
      .updateOne({ _id: admin._id }, { $set: { mfaEnabled: true, mfaSecret: 'TESTSECRET' } });

    const req = {
      headers: {
        'x-admin-stepup': 'invalid-step-up-token',
      },
      adminId: admin._id?.toString(),
    } as unknown as IAdminAuthenticatedRequest;

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
      error: expect.stringContaining(''),
      code: 'MFA_STEP_UP_INVALID',
    });
  });
});
