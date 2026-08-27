import { type Response } from 'express';
import { authMiddleware, type IAuthenticatedRequest } from './auth';
import { AuthService } from '@scholaracle/auth';
import { UserRepository } from '@scholaracle/database';
import { MongoClient, type Db } from 'mongodb';

describe('authMiddleware', () => {
  let client: MongoClient;
  let database: Db;
  let authService: AuthService;
  let middleware: ReturnType<typeof authMiddleware>;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    authService = new AuthService(database, 'test-secret', '1h');
    middleware = authMiddleware(authService);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
  });

  it('should allow request with valid user token', async () => {
    const registerResult = await authService.register('user@test.com', 'TestPass123!', 'Test User');
    expect(registerResult.success).toBe(true);

    const req = {
      headers: {
        authorization: `Bearer ${registerResult.token}`,
      },
    } as IAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userId).toBe(registerResult.user?.id);
    expect(req.userEmail).toBe('user@test.com');
    expect(req.userRole).toBe('parent');
    expect(req.studentId).toBeUndefined();
  });

  it('attaches student role and studentId from the JWT', async () => {
    const passwordHash = await UserRepository.hashPassword('TestPass123!');
    await new UserRepository(database).create({
      email: 'student-mw@test.com',
      passwordHash,
      name: 'Student MW',
      role: 'student',
      studentId: '507f1f77bcf86cd799439011',
    });
    const login = await authService.login('student-mw@test.com', 'TestPass123!');
    expect(login.success).toBe(true);

    const req = {
      headers: {
        authorization: `Bearer ${login.token}`,
      },
    } as IAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.userRole).toBe('student');
    expect(req.studentId).toBe('507f1f77bcf86cd799439011');
  });

  it('should reject request without authorization header', async () => {
    const req = {
      headers: {},
    } as IAuthenticatedRequest;

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

  it('should reject request with non-Bearer token', async () => {
    const req = {
      headers: {
        authorization: 'Basic dXNlcjpwYXNz',
      },
    } as IAuthenticatedRequest;

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
    } as IAuthenticatedRequest;

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
      error: 'Invalid or expired token',
    });
  });

  it('should reject request with expired token', async () => {
    const expiredAuthService = new AuthService(database, 'test-secret', '0s');
    const expiredMiddleware = authMiddleware(expiredAuthService);

    const registerResult = await expiredAuthService.register(
      'expired@test.com',
      'TestPass123!',
      'Expired User'
    );
    expect(registerResult.success).toBe(true);

    // Wait for the token to expire
    await new Promise((resolve) => setTimeout(resolve, 100));

    const req = {
      headers: {
        authorization: `Bearer ${registerResult.token}`,
      },
    } as IAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    await expiredMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
