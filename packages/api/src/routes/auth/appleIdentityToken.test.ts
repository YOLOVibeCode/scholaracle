import crypto from 'node:crypto';
import {
  APPLE_ISSUER,
  resetAppleJwksCacheForTests,
  verifyAppleIdentityToken,
} from './appleIdentityToken';

describe('verifyAppleIdentityToken', () => {
  beforeEach(() => {
    resetAppleJwksCacheForTests();
  });

  it('rejects a forged token when signature does not match JWKS key', async () => {
    const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = {
      ...(publicKey.export({ format: 'jwk' }) as crypto.JsonWebKey),
      kid: 'test-kid-1',
    };

    const kid = 'test-kid-1';
    const now = Math.floor(Date.now() / 1000);
    const rawNonce = 'abc123raw';
    const nonceHash = crypto.createHash('sha256').update(rawNonce, 'utf8').digest('hex');

    const payload = {
      iss: APPLE_ISSUER,
      aud: 'com.scholarmancy.app',
      exp: now + 3600,
      iat: now,
      sub: 'apple.user.sub',
      nonce: nonceHash,
    };

    const headerObj = { alg: 'ES256', typ: 'JWT', kid };
    const headerB64 = base64UrlJson(headerObj);
    const payloadB64 = base64UrlJson(payload);
    const signingInput = `${headerB64}.${payloadB64}`;
    const badSig = crypto.randomBytes(64);

    const identityToken = `${signingInput}.${base64UrlBuf(badSig)}`;

    const fetchJson = async (): Promise<{ keys: (typeof jwk)[] }> => ({ keys: [jwk] });

    await expect(
      verifyAppleIdentityToken({
        identityToken,
        rawNonce,
        audiences: ['com.scholarmancy.app'],
        fetchJson,
      })
    ).rejects.toThrow(/signature/i);
  });

  it('accepts a valid token signed with the advertised JWKS key', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = {
      ...(publicKey.export({ format: 'jwk' }) as crypto.JsonWebKey),
      kid: 'test-kid-2',
    };

    const kid = 'test-kid-2';
    const now = Math.floor(Date.now() / 1000);
    const rawNonce = 'xyz789raw';
    const nonceHash = crypto.createHash('sha256').update(rawNonce, 'utf8').digest('hex');

    const sub = '001234.abcde';
    const payload = {
      iss: APPLE_ISSUER,
      aud: 'com.scholarmancy.app',
      exp: now + 3600,
      iat: now,
      sub,
      nonce: nonceHash,
      email: 'user@privaterelay.appleid.com',
    };

    const headerObj = { alg: 'ES256', typ: 'JWT', kid };
    const headerB64 = base64UrlJson(headerObj);
    const payloadB64 = base64UrlJson(payload);
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    });

    const identityToken = `${signingInput}.${base64UrlBuf(sig)}`;

    const fetchJson = async (): Promise<{ keys: (typeof jwk)[] }> => ({ keys: [jwk] });

    const out = await verifyAppleIdentityToken({
      identityToken,
      rawNonce,
      audiences: ['com.scholarmancy.app'],
      fetchJson,
    });
    expect(out.sub).toBe(sub);
    expect(out.email).toBe('user@privaterelay.appleid.com');
  });

  it('accepts a valid token with no nonce claim when raw nonce is omitted', async () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = {
      ...(publicKey.export({ format: 'jwk' }) as crypto.JsonWebKey),
      kid: 'test-kid-no-nonce',
    };

    const kid = 'test-kid-no-nonce';
    const now = Math.floor(Date.now() / 1000);
    const sub = '001234.nononce';

    const payload = {
      iss: APPLE_ISSUER,
      aud: 'com.scholarmancy.app',
      exp: now + 3600,
      iat: now,
      sub,
    };

    const headerObj = { alg: 'ES256', typ: 'JWT', kid };
    const headerB64 = base64UrlJson(headerObj);
    const payloadB64 = base64UrlJson(payload);
    const signingInput = `${headerB64}.${payloadB64}`;
    const sig = crypto.sign('sha256', Buffer.from(signingInput, 'utf8'), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    });

    const identityToken = `${signingInput}.${base64UrlBuf(sig)}`;

    const fetchJson = async (): Promise<{ keys: (typeof jwk)[] }> => ({ keys: [jwk] });

    const out = await verifyAppleIdentityToken({
      identityToken,
      audiences: ['com.scholarmancy.app'],
      fetchJson,
    });
    expect(out.sub).toBe(sub);
  });
});

function base64UrlJson(obj: unknown): string {
  return base64UrlBuf(Buffer.from(JSON.stringify(obj), 'utf8'));
}

function base64UrlBuf(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
