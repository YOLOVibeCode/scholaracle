/**
 * Sign in with Apple: revoke the user's tokens when their account is deleted
 * (App Review guideline 5.1.1(v)).
 *
 * The app stores no Apple tokens. At deletion the phone runs a fresh Sign in with Apple and
 * sends the one-time authorization code with the request. The server exchanges the code for
 * a refresh token and revokes it straight away. After that the app no longer appears under
 * "Sign in with Apple" in the user's Apple account.
 *
 * Needs a "Sign in with Apple" key from the Apple Developer account:
 *   APPLE_TEAM_ID              10-character team id
 *   APPLE_SIGN_IN_KEY_ID       10-character key id
 *   APPLE_SIGN_IN_PRIVATE_KEY  contents of the .p8 file (PEM; "\n" escapes are accepted)
 * Without all three, revocation is skipped and reported as 'not_configured'.
 */

import { createPrivateKey, sign, type KeyObject } from 'node:crypto';

export const APPLE_ID_ORIGIN = 'https://appleid.apple.com';
const TOKEN_URL = `${APPLE_ID_ORIGIN}/auth/token`;
const REVOKE_URL = `${APPLE_ID_ORIGIN}/auth/revoke`;
/** Apple accepts up to six months; a secret is built per call, so keep it short. */
const CLIENT_SECRET_TTL_SECONDS = 5 * 60;
const REQUEST_TIMEOUT_MS = 10_000;

export interface IAppleRevocationConfig {
  readonly teamId: string;
  readonly keyId: string;
  /** PEM text of the Sign in with Apple private key (.p8). */
  readonly privateKeyPem: string;
}

/**
 * - revoked: Apple accepted the revocation.
 * - not_configured: this server has no Sign in with Apple key.
 * - failed: Apple refused the code or the revocation, or could not be reached.
 */
export type AppleRevocationOutcome =
  | { readonly status: 'revoked' }
  | { readonly status: 'not_configured' }
  | { readonly status: 'failed'; readonly step: 'exchange' | 'revoke'; readonly reason: string };

export interface IAppleTokenRevoker {
  /**
   * @param authorizationCode one-time code from a fresh Sign in with Apple (valid 5 minutes)
   * @param clientId the app's bundle id: the `aud` of the identity token issued with the code
   * @param expectedSub the Apple account id the caller already verified; a code that belongs
   *   to a different Apple account is not revoked
   */
  revokeWithAuthorizationCode(
    authorizationCode: string,
    clientId: string,
    expectedSub: string
  ): Promise<AppleRevocationOutcome>;
}

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function appleRevocationConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): IAppleRevocationConfig | null {
  const teamId = (env['APPLE_TEAM_ID'] ?? '').trim();
  const keyId = (env['APPLE_SIGN_IN_KEY_ID'] ?? '').trim();
  const privateKeyPem = (env['APPLE_SIGN_IN_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n').trim();
  if (teamId === '' || keyId === '' || privateKeyPem === '') return null;
  return { teamId, keyId, privateKeyPem };
}

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

/** The ES256 JWT Apple expects as `client_secret`. */
export function buildAppleClientSecret(
  config: IAppleRevocationConfig,
  clientId: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  key: KeyObject = createPrivateKey(config.privateKeyPem)
): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({
      iss: config.teamId,
      iat: nowSeconds,
      exp: nowSeconds + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_ID_ORIGIN,
      sub: clientId,
    })
  );
  const signature = sign('sha256', Buffer.from(`${header}.${payload}`, 'utf8'), {
    key,
    dsaEncoding: 'ieee-p1363',
  });
  return `${header}.${payload}.${b64url(signature)}`;
}

/**
 * `sub` of the id_token Apple returns with the exchange. It arrives straight from Apple over
 * TLS in answer to our own request, so its signature is not checked again here.
 */
function subOfIdToken(idToken: unknown): string | null {
  if (typeof idToken !== 'string') return null;
  const payload = idToken.split('.')[1];
  if (payload === undefined || payload === '') return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: unknown;
    };
    return typeof claims.sub === 'string' && claims.sub !== '' ? claims.sub : null;
  } catch {
    return null;
  }
}

/** Apple's short error code ("invalid_grant", "invalid_client"); never a token or the body. */
async function appleErrorCode(res: { status: number; json(): Promise<unknown> }): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown } | null;
    const code = body !== null && typeof body.error === 'string' ? body.error : '';
    return /^[a-z_]{1,40}$/.test(code) ? `${res.status} ${code}` : `${res.status}`;
  } catch {
    return `${res.status}`;
  }
}

export class AppleTokenRevoker implements IAppleTokenRevoker {
  private readonly _config: IAppleRevocationConfig | null;
  private readonly _fetch: FetchLike;

  constructor(config: IAppleRevocationConfig | null, fetchImpl?: FetchLike) {
    this._config = config;
    this._fetch = fetchImpl ?? ((url, init): ReturnType<FetchLike> => fetch(url, init));
  }

  async revokeWithAuthorizationCode(
    authorizationCode: string,
    clientId: string,
    expectedSub: string
  ): Promise<AppleRevocationOutcome> {
    const config = this._config;
    if (config === null) return { status: 'not_configured' };

    let clientSecret: string;
    try {
      clientSecret = buildAppleClientSecret(config, clientId);
    } catch {
      // A malformed key must not surface its text; say only that signing failed.
      return { status: 'failed', step: 'exchange', reason: 'could not sign the client secret' };
    }

    let refreshToken: string;
    try {
      const res = await this._post(TOKEN_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        code: authorizationCode,
        grant_type: 'authorization_code',
      });
      if (!res.ok) {
        return { status: 'failed', step: 'exchange', reason: await appleErrorCode(res) };
      }
      const body = (await res.json()) as { refresh_token?: unknown; id_token?: unknown } | null;
      if (body === null || typeof body.refresh_token !== 'string' || body.refresh_token === '') {
        return { status: 'failed', step: 'exchange', reason: 'no refresh token in the response' };
      }
      if (subOfIdToken(body.id_token) !== expectedSub) {
        return {
          status: 'failed',
          step: 'exchange',
          reason: 'the code belongs to a different Apple account',
        };
      }
      refreshToken = body.refresh_token;
    } catch {
      return { status: 'failed', step: 'exchange', reason: 'request failed' };
    }

    try {
      const res = await this._post(REVOKE_URL, {
        client_id: clientId,
        client_secret: clientSecret,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      });
      if (!res.ok) {
        return { status: 'failed', step: 'revoke', reason: await appleErrorCode(res) };
      }
    } catch {
      return { status: 'failed', step: 'revoke', reason: 'request failed' };
    }
    return { status: 'revoked' };
  }

  private _post(
    url: string,
    form: Record<string, string>
  ): Promise<{ ok: boolean; status: number; json(): Promise<unknown> }> {
    return this._fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }
}
