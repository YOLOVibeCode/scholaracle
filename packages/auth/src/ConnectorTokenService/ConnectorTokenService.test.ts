import jwt from 'jsonwebtoken';
import { ConnectorTokenService } from './ConnectorTokenService';

describe('ConnectorTokenService', () => {
  it('creates and verifies connector tokens with deviceId', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    const token = svc.createToken('user-123', 'jti-1', 'device-a');

    const decoded = svc.verifyToken(token);
    expect(decoded).toBeTruthy();
    expect(decoded?.userId).toBe('user-123');
    expect(decoded?.type).toBe('connector');
    expect(decoded?.scope).toBe('ingest');
    expect(decoded?.jti).toBe('jti-1');
    expect(decoded?.deviceId).toBe('device-a');
  });

  it('rejects invalid tokens', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    expect(svc.verifyToken('not-a-token')).toBeNull();
  });

  it('rejects tokens signed with a different secret', () => {
    const svc1 = new ConnectorTokenService('secret-one', '1h');
    const svc2 = new ConnectorTokenService('secret-two', '1h');
    const token = svc1.createToken('user-1', 'jti-1', 'device-a');
    expect(svc2.verifyToken(token)).toBeNull();
  });

  it('rejects tokens with wrong type field', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    const fakeToken = jwt.sign(
      { type: 'admin', scope: 'ingest', userId: 'user-1', jti: 'jti-1', deviceId: 'd' },
      'test-secret'
    );
    expect(svc.verifyToken(fakeToken)).toBeNull();
  });

  it('rejects tokens with wrong scope field', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    const fakeToken = jwt.sign(
      { type: 'connector', scope: 'admin', userId: 'user-1', jti: 'jti-1', deviceId: 'd' },
      'test-secret'
    );
    expect(svc.verifyToken(fakeToken)).toBeNull();
  });

  it('rejects tokens missing userId', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    const fakeToken = jwt.sign(
      { type: 'connector', scope: 'ingest', jti: 'jti-1', deviceId: 'd' },
      'test-secret'
    );
    expect(svc.verifyToken(fakeToken)).toBeNull();
  });

  it('rejects tokens missing jti', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    const fakeToken = jwt.sign(
      { type: 'connector', scope: 'ingest', userId: 'user-1', deviceId: 'd' },
      'test-secret'
    );
    expect(svc.verifyToken(fakeToken)).toBeNull();
  });

  it('rejects tokens missing deviceId', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    const fakeToken = jwt.sign(
      { type: 'connector', scope: 'ingest', userId: 'user-1', jti: 'jti-1' },
      'test-secret'
    );
    expect(svc.verifyToken(fakeToken)).toBeNull();
  });

  it('clamps expiry longer than 90 days', () => {
    const svc = new ConnectorTokenService('test-secret', '365d');
    expect(svc.expiresInLabel).toBe('90d');
  });

  it('uses default secret when none provided', () => {
    const svc = new ConnectorTokenService();
    const token = svc.createToken('user-1', 'jti-1', 'device-default');
    const decoded = svc.verifyToken(token);
    expect(decoded).toBeTruthy();
    expect(decoded?.userId).toBe('user-1');
  });
});
