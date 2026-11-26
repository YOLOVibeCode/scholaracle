/**
 * Unit tests for Sign in with Apple token revocation. Apple is never called: fetch is injected.
 */

import crypto from 'node:crypto';
import {
  APPLE_ID_ORIGIN,
  AppleTokenRevoker,
  appleRevocationConfigFromEnv,
  buildAppleClientSecret,
  type IAppleRevocationConfig,
} from './appleTokenRevocation';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const CONFIG: IAppleRevocationConfig = {
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  privateKeyPem: PEM,
};
const CLIENT_ID = 'com.scholarmancy.app';
const SUB = '001234.abcdef.5678';

const b64json = (o: unknown): string => Buffer.from(JSON.stringify(o)).toString('base64url');
const idTokenFor = (sub: string): string => `${b64json({ alg: 'ES256' })}.${b64json({ sub })}.sig`;

interface ICall {
  readonly url: string;
  readonly form: URLSearchParams;
  readonly contentType: string | undefined;
}

type Reply = { ok: boolean; status: number; body?: unknown } | Error;

function fakeFetch(replies: Reply[]): {
  calls: ICall[];
  fetchImpl: ConstructorParameters<typeof AppleTokenRevoker>[1];
} {
  const calls: ICall[] = [];
  const queue = [...replies];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({
        url,
        form: new URLSearchParams(init.body),
        contentType: init.headers['Content-Type'],
      });
      const reply = queue.shift();
      if (reply === undefined) throw new Error('unexpected request');
      if (reply instanceof Error) throw reply;
      return {
        ok: reply.ok,
        status: reply.status,
        json: async () => {
          if (reply.body === undefined) throw new Error('empty body');
          return reply.body;
        },
      };
    },
  };
}

const exchangeOk = (sub = SUB): Reply => ({
  ok: true,
  status: 200,
  body: { access_token: 'access-1', refresh_token: 'refresh-1', id_token: idTokenFor(sub) },
});
const revokeOk: Reply = { ok: true, status: 200 };

describe('appleRevocationConfigFromEnv', () => {
  it('is null unless team id, key id and private key are all set', () => {
    expect(appleRevocationConfigFromEnv({})).toBeNull();
    expect(
      appleRevocationConfigFromEnv({ APPLE_TEAM_ID: 'T', APPLE_SIGN_IN_KEY_ID: 'K' })
    ).toBeNull();
    expect(
      appleRevocationConfigFromEnv({ APPLE_TEAM_ID: 'T', APPLE_SIGN_IN_PRIVATE_KEY: PEM })
    ).toBeNull();
    expect(
      appleRevocationConfigFromEnv({ APPLE_SIGN_IN_KEY_ID: 'K', APPLE_SIGN_IN_PRIVATE_KEY: PEM })
    ).toBeNull();
  });

  it('reads the three values and accepts a key pasted with \\n escapes', () => {
    const config = appleRevocationConfigFromEnv({
      APPLE_TEAM_ID: ' TEAM123456 ',
      APPLE_SIGN_IN_KEY_ID: 'KEY1234567',
      APPLE_SIGN_IN_PRIVATE_KEY: PEM.replace(/\n/g, '\\n'),
    });
    expect(config).toEqual({
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKeyPem: PEM.trim(),
    });
  });
});

describe('buildAppleClientSecret', () => {
  it('is an ES256 JWT Apple can verify, with the claims Apple requires', () => {
    const now = 1_800_000_000;
    const jwt = buildAppleClientSecret(CONFIG, CLIENT_ID, now);
    const [header, payload, signature] = jwt.split('.') as [string, string, string];

    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({
      alg: 'ES256',
      kid: 'KEY1234567',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(payload, 'base64url').toString())).toEqual({
      iss: 'TEAM123456',
      iat: now,
      exp: now + 300,
      aud: APPLE_ID_ORIGIN,
      sub: CLIENT_ID,
    });
    expect(
      crypto.verify(
        'sha256',
        Buffer.from(`${header}.${payload}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url')
      )
    ).toBe(true);
  });
});

describe('AppleTokenRevoker', () => {
  it('exchanges the code, then revokes the refresh token it got back', async () => {
    const { calls, fetchImpl } = fakeFetch([exchangeOk(), revokeOk]);
    const outcome = await new AppleTokenRevoker(CONFIG, fetchImpl).revokeWithAuthorizationCode(
      'code-1',
      CLIENT_ID,
      SUB
    );

    expect(outcome).toEqual({ status: 'revoked' });
    expect(calls.map((c) => c.url)).toEqual([
      'https://appleid.apple.com/auth/token',
      'https://appleid.apple.com/auth/revoke',
    ]);
    const [exchange, revoke] = calls as [ICall, ICall];
    expect(exchange.contentType).toBe('application/x-www-form-urlencoded');
    expect(exchange.form.get('grant_type')).toBe('authorization_code');
    expect(exchange.form.get('code')).toBe('code-1');
    expect(exchange.form.get('client_id')).toBe(CLIENT_ID);
    expect(exchange.form.get('client_secret')?.split('.')).toHaveLength(3);
    expect(revoke.form.get('token')).toBe('refresh-1');
    expect(revoke.form.get('token_type_hint')).toBe('refresh_token');
    expect(revoke.form.get('client_id')).toBe(CLIENT_ID);
    expect(revoke.form.get('client_secret')).toBe(exchange.form.get('client_secret'));
  });

  it('does nothing and says so when the server has no Apple key', async () => {
    const { calls, fetchImpl } = fakeFetch([]);
    const outcome = await new AppleTokenRevoker(null, fetchImpl).revokeWithAuthorizationCode(
      'code-1',
      CLIENT_ID,
      SUB
    );
    expect(outcome).toEqual({ status: 'not_configured' });
    expect(calls).toHaveLength(0);
  });

  it('reports a refused code with Apple’s error code and does not try to revoke', async () => {
    const { calls, fetchImpl } = fakeFetch([
      { ok: false, status: 400, body: { error: 'invalid_grant' } },
    ]);
    const outcome = await new AppleTokenRevoker(CONFIG, fetchImpl).revokeWithAuthorizationCode(
      'used-code',
      CLIENT_ID,
      SUB
    );
    expect(outcome).toEqual({ status: 'failed', step: 'exchange', reason: '400 invalid_grant' });
    expect(calls).toHaveLength(1);
  });

  it('never revokes a code that belongs to a different Apple account', async () => {
    const { calls, fetchImpl } = fakeFetch([exchangeOk('someone.else')]);
    const outcome = await new AppleTokenRevoker(CONFIG, fetchImpl).revokeWithAuthorizationCode(
      'code-1',
      CLIENT_ID,
      SUB
    );
    expect(outcome).toMatchObject({ status: 'failed', step: 'exchange' });
    expect(calls).toHaveLength(1);
  });

  it('reports a failed revocation', async () => {
    const { fetchImpl } = fakeFetch([
      exchangeOk(),
      { ok: false, status: 400, body: { error: 'invalid_client' } },
    ]);
    const outcome = await new AppleTokenRevoker(CONFIG, fetchImpl).revokeWithAuthorizationCode(
      'code-1',
      CLIENT_ID,
      SUB
    );
    expect(outcome).toEqual({ status: 'failed', step: 'revoke', reason: '400 invalid_client' });
  });

  it('turns network errors and odd responses into a failure, never a throw', async () => {
    const down = fakeFetch([new Error('ECONNRESET')]);
    await expect(
      new AppleTokenRevoker(CONFIG, down.fetchImpl).revokeWithAuthorizationCode('c', CLIENT_ID, SUB)
    ).resolves.toEqual({ status: 'failed', step: 'exchange', reason: 'request failed' });

    const noToken = fakeFetch([{ ok: true, status: 200, body: { id_token: idTokenFor(SUB) } }]);
    await expect(
      new AppleTokenRevoker(CONFIG, noToken.fetchImpl).revokeWithAuthorizationCode(
        'c',
        CLIENT_ID,
        SUB
      )
    ).resolves.toMatchObject({ status: 'failed', step: 'exchange' });

    const revokeDown = fakeFetch([exchangeOk(), new Error('timeout')]);
    await expect(
      new AppleTokenRevoker(CONFIG, revokeDown.fetchImpl).revokeWithAuthorizationCode(
        'c',
        CLIENT_ID,
        SUB
      )
    ).resolves.toEqual({ status: 'failed', step: 'revoke', reason: 'request failed' });
  });

  it('keeps anything that is not a short error code out of the reason', async () => {
    const { fetchImpl } = fakeFetch([
      { ok: false, status: 500, body: { error: 'Something long with a token=abc.def.ghi inside' } },
    ]);
    const outcome = await new AppleTokenRevoker(CONFIG, fetchImpl).revokeWithAuthorizationCode(
      'code-1',
      CLIENT_ID,
      SUB
    );
    expect(outcome).toEqual({ status: 'failed', step: 'exchange', reason: '500' });
  });

  it('a malformed private key is a failure without the key text', async () => {
    const { calls, fetchImpl } = fakeFetch([]);
    const outcome = await new AppleTokenRevoker(
      { ...CONFIG, privateKeyPem: 'not a key' },
      fetchImpl
    ).revokeWithAuthorizationCode('code-1', CLIENT_ID, SUB);
    expect(outcome).toEqual({
      status: 'failed',
      step: 'exchange',
      reason: 'could not sign the client secret',
    });
    expect(calls).toHaveLength(0);
  });
});
