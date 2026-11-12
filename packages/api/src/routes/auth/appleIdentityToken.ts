import crypto from 'node:crypto';

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

interface IAppleEcJwk {
  readonly kty: string;
  readonly kid: string;
  readonly use?: string;
  readonly alg?: string;
  readonly crv?: string;
  readonly x?: string;
  readonly y?: string;
}

interface IJwksResponse {
  readonly keys?: ReadonlyArray<IAppleEcJwk>;
}

export interface IVerifyAppleIdentityTokenInput {
  readonly identityToken: string;
  /** Required when the identity token includes a `nonce` claim (native Sign in with Apple). */
  readonly rawNonce?: string;
  readonly audiences: readonly string[];
  readonly fetchJson?: (url: string) => Promise<unknown>;
}

export interface IAppleVerifiedClaims {
  readonly sub: string;
  readonly email?: string;
  /** The allowed audience the token was issued for (the app's bundle id). */
  readonly aud: string;
}

let jwksCache: { readonly keys: ReadonlyArray<IAppleEcJwk>; readonly fetchedAt: number } | null =
  null;
const JWKS_CACHE_MS = 60 * 60 * 1000;

/** Test hook: clear in-memory JWKS cache between cases. */
export function resetAppleJwksCacheForTests(): void {
  jwksCache = null;
}

function base64UrlDecodeToBuffer(segment: string): Buffer {
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  return Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function parseJwt(identityToken: string): {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
  readonly signingInput: string;
  readonly signature: Buffer;
} {
  const parts = identityToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format');
  }
  const headerSeg = parts[0];
  const payloadSeg = parts[1];
  const sigSeg = parts[2];
  if (headerSeg === undefined || payloadSeg === undefined || sigSeg === undefined) {
    throw new Error('Invalid token format');
  }
  const header = JSON.parse(base64UrlDecodeToBuffer(headerSeg).toString('utf8')) as Record<
    string,
    unknown
  >;
  const payload = JSON.parse(base64UrlDecodeToBuffer(payloadSeg).toString('utf8')) as Record<
    string,
    unknown
  >;
  return {
    header,
    payload,
    signingInput: `${headerSeg}.${payloadSeg}`,
    signature: base64UrlDecodeToBuffer(sigSeg),
  };
}

function sha256HexOfUtf8(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function jwkToPublicKey(jwk: IAppleEcJwk): crypto.KeyObject {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || jwk.x === undefined || jwk.y === undefined) {
    throw new Error('Unsupported JWK');
  }
  return crypto.createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y },
    format: 'jwk',
  });
}

function readStringClaim(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** The first of the token's audiences that is allowed, or null. */
function matchedAudience(tokenAud: unknown, allowed: readonly string[]): string | null {
  const candidates: readonly unknown[] = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && allowed.includes(candidate)) return candidate;
  }
  return null;
}

async function loadAppleJwks(
  fetchJson: (url: string) => Promise<unknown>
): Promise<ReadonlyArray<IAppleEcJwk>> {
  const now = Date.now();
  if (jwksCache !== null && now - jwksCache.fetchedAt < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }
  const data = (await fetchJson(APPLE_JWKS_URL)) as IJwksResponse;
  const keys = data.keys ?? [];
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

/**
 * Verify an Apple `identityToken` (JWT): ES256 signature via JWKS, iss, aud, exp, nonce.
 */
export async function verifyAppleIdentityToken(
  input: IVerifyAppleIdentityTokenInput
): Promise<IAppleVerifiedClaims> {
  const fetchJson = input.fetchJson ?? defaultFetchJson;
  const { header, payload, signingInput, signature } = parseJwt(input.identityToken);

  const alg = header['alg'];
  const kid = readStringClaim(header['kid']);
  if (alg !== 'ES256' || kid === undefined || kid === '') {
    throw new Error('Invalid token header');
  }

  const iss = readStringClaim(payload['iss']);
  if (iss !== APPLE_ISSUER) {
    throw new Error('Invalid issuer');
  }

  const aud = matchedAudience(payload['aud'], input.audiences);
  if (aud === null) {
    throw new Error('Invalid audience');
  }

  const exp = payload['exp'];
  const iat = payload['iat'];
  const nowSec = Math.floor(Date.now() / 1000);
  const skew = 60;
  if (typeof exp !== 'number' || exp + skew < nowSec) {
    throw new Error('Token expired');
  }
  if (typeof iat !== 'number' || iat > nowSec + skew) {
    throw new Error('Invalid issue time');
  }

  const tokenNonce = readStringClaim(payload['nonce']);
  if (tokenNonce !== undefined) {
    const raw = input.rawNonce ?? '';
    if (tokenNonce !== sha256HexOfUtf8(raw)) {
      throw new Error('Invalid nonce');
    }
  }

  const sub = readStringClaim(payload['sub']);
  if (sub === undefined || sub === '') {
    throw new Error('Invalid subject');
  }

  const keys = await loadAppleJwks(fetchJson);
  const jwk = keys.find((k) => k.kid === kid);
  if (jwk === undefined) {
    throw new Error('Signing key not found');
  }

  const publicKey = jwkToPublicKey(jwk);
  const isOk = crypto.verify(
    'sha256',
    Buffer.from(signingInput, 'utf8'),
    { key: publicKey, dsaEncoding: 'ieee-p1363' },
    signature
  );
  if (!isOk) {
    throw new Error('Invalid signature');
  }

  const email = readStringClaim(payload['email']);
  return { sub, email, aud };
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`JWKS request failed: ${res.status}`);
  }
  return (await res.json()) as unknown;
}
