import { type Response } from 'express';
import { connectorAuthMiddleware, type IConnectorAuthenticatedRequest } from './connectorAuth';
import { ConnectorTokenService } from '@scholaracle/auth';

describe('connectorAuthMiddleware', () => {
  let connectorTokenService: ConnectorTokenService;
  let middleware: ReturnType<typeof connectorAuthMiddleware>;

  beforeAll(() => {
    connectorTokenService = new ConnectorTokenService('test-secret', '1h');
    middleware = connectorAuthMiddleware(connectorTokenService);
  });

  it('should allow request with valid connector token', () => {
    const userId = 'user-123';
    const jti = 'token-jti-456';
    const token = connectorTokenService.createToken(userId, jti);

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as IConnectorAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.connectorUserId).toBe(userId);
    expect(req.connectorJti).toBe(jti);
  });

  it('should reject request without authorization header', () => {
    const req = {
      headers: {},
    } as IConnectorAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing or invalid authorization header',
    });
  });

  it('should reject request with invalid token', () => {
    const req = {
      headers: {
        authorization: 'Bearer bad-token',
      },
    } as IConnectorAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid or expired token',
    });
  });

  it('should reject request with token from different secret', () => {
    const otherService = new ConnectorTokenService('different-secret', '1h');
    const token = otherService.createToken('user-123', 'jti-789');

    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    } as IConnectorAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid or expired token',
    });
  });

  it('should reject request with non-Bearer auth', () => {
    const req = {
      headers: {
        authorization: 'Basic dXNlcjpwYXNz',
      },
    } as IConnectorAuthenticatedRequest;

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Response;

    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Missing or invalid authorization header',
    });
  });
});
