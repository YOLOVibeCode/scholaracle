import { ConnectorTokenService } from './ConnectorTokenService';

describe('ConnectorTokenService', () => {
  it('creates and verifies connector tokens', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    const token = svc.createToken('user-123', 'jti-1');

    const decoded = svc.verifyToken(token);
    expect(decoded).toBeTruthy();
    expect(decoded?.userId).toBe('user-123');
    expect(decoded?.type).toBe('connector');
    expect(decoded?.scope).toBe('ingest');
  });

  it('rejects invalid tokens', () => {
    const svc = new ConnectorTokenService('test-secret', '1h');
    expect(svc.verifyToken('not-a-token')).toBeNull();
  });
});


