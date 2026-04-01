import type { Request, Response, NextFunction } from 'express';
import { adminIpRestrict } from './adminIpRestrict';

describe('adminIpRestrict', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonFn: jest.Mock;

  beforeEach(() => {
    jsonFn = jest.fn();
    req = {
      headers: {},
      socket: { remoteAddress: '192.168.1.100' } as Request['socket'],
    };
    res = {
      status: jest.fn().mockReturnThis() as unknown as Response['status'],
      json: jsonFn as unknown as Response['json'],
    };
    next = jest.fn();
  });

  it('should allow all requests when no IPs configured (opt-in)', () => {
    const middleware = adminIpRestrict([]);
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should allow all requests when undefined IPs', () => {
    const middleware = adminIpRestrict(undefined);
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should allow request from allowed IP', () => {
    const middleware = adminIpRestrict(['192.168.1.100', '10.0.0.1']);
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should block request from non-allowed IP', () => {
    const middleware = adminIpRestrict(['10.0.0.1', '10.0.0.2']);
    middleware(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('IP address not in allowlist') })
    );
  });

  it('should use x-forwarded-for header when available', () => {
    req.headers = { 'x-forwarded-for': '203.0.113.50, 70.41.3.18' };
    const middleware = adminIpRestrict(['203.0.113.50']);
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should trim whitespace from configured IPs', () => {
    const middleware = adminIpRestrict(['  192.168.1.100  ', ' 10.0.0.1 ']);
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should ignore empty strings in allowlist', () => {
    const middleware = adminIpRestrict(['', '  ']);
    // Empty strings filtered out = no allowlist = allow all
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});
