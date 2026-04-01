import type { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import type { IAdminAuthenticatedRequest } from './adminAuth';
import { sessionTimeoutMiddleware } from './sessionTimeout';

jest.mock('jsonwebtoken');
const mockDecode = jwt.decode as jest.MockedFunction<typeof jwt.decode>;

describe('sessionTimeoutMiddleware', () => {
  const mockSessionRepo = {
    findByFamilyId: jest.fn(),
    revokeById: jest.fn(),
    updateLastActive: jest.fn(),
    create: jest.fn(),
    findActiveByUserId: jest.fn(),
    findActiveByAdminId: jest.fn(),
    revokeByFamilyId: jest.fn(),
    revokeAllExcept: jest.fn(),
    findActiveSessionsForUser: jest.fn(),
    findActiveSessionsForAdmin: jest.fn(),
  };

  let req: Partial<IAdminAuthenticatedRequest>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonFn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jsonFn = jest.fn();
    req = {
      adminId: 'admin-123',
      headers: { authorization: 'Bearer test-token' },
    };
    res = {
      status: jest.fn().mockReturnThis() as unknown as Response['status'],
      json: jsonFn as unknown as Response['json'],
    };
    next = jest.fn();
    mockDecode.mockReturnValue({ jti: 'family-123' });
  });

  it('should call next() if session is still active', async () => {
    mockSessionRepo.findByFamilyId.mockResolvedValue({
      _id: { toString: () => 'sess-1' },
      lastActiveAt: new Date(),
    });

    const middleware = sessionTimeoutMiddleware(mockSessionRepo, 30);
    await middleware(req as IAdminAuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockSessionRepo.updateLastActive).toHaveBeenCalledWith('sess-1');
  });

  it('should return 401 if session has expired due to inactivity', async () => {
    const thirtyOneMinutesAgo = new Date(Date.now() - 31 * 60 * 1000);
    mockSessionRepo.findByFamilyId.mockResolvedValue({
      _id: { toString: () => 'sess-1' },
      lastActiveAt: thirtyOneMinutesAgo,
    });

    const middleware = sessionTimeoutMiddleware(mockSessionRepo, 30);
    await middleware(req as IAdminAuthenticatedRequest, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(jsonFn).toHaveBeenCalledWith(expect.objectContaining({ code: 'SESSION_TIMEOUT' }));
    expect(mockSessionRepo.revokeById).toHaveBeenCalledWith('sess-1');
  });

  it('should return 401 if session has been revoked', async () => {
    mockSessionRepo.findByFamilyId.mockResolvedValue({
      _id: { toString: () => 'sess-1' },
      lastActiveAt: new Date(),
      revokedAt: new Date(),
    });

    const middleware = sessionTimeoutMiddleware(mockSessionRepo, 30);
    await middleware(req as IAdminAuthenticatedRequest, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should pass through if no adminId on request', async () => {
    req.adminId = undefined;

    const middleware = sessionTimeoutMiddleware(mockSessionRepo, 30);
    await middleware(req as IAdminAuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(mockSessionRepo.findByFamilyId).not.toHaveBeenCalled();
  });

  it('should pass through if no session found', async () => {
    mockSessionRepo.findByFamilyId.mockResolvedValue(null);

    const middleware = sessionTimeoutMiddleware(mockSessionRepo, 30);
    await middleware(req as IAdminAuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should pass through on errors without blocking', async () => {
    mockSessionRepo.findByFamilyId.mockRejectedValue(new Error('DB error'));

    const middleware = sessionTimeoutMiddleware(mockSessionRepo, 30);
    await middleware(req as IAdminAuthenticatedRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should use custom timeout value', async () => {
    const fiveMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
    mockSessionRepo.findByFamilyId.mockResolvedValue({
      _id: { toString: () => 'sess-1' },
      lastActiveAt: fiveMinutesAgo,
    });

    const middleware = sessionTimeoutMiddleware(mockSessionRepo, 5);
    await middleware(req as IAdminAuthenticatedRequest, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
