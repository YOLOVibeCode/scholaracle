/**
 * Write-time redaction so secrets never enter the diag buffer.
 *
 * Redacts:
 * - Bearer tokens in Authorization headers
 * - Sensitive object keys (token, password, authorization, cookie…)
 * - Query-string params: token=, X-Amz-Signature=, X-Amz-Credential=,
 *   X-Amz-Security-Token=, Expires= (signed S3 asset URLs)
 *
 * Does NOT use the URL API — RN's polyfill is http-only and never throws.
 */

const SENSITIVE_KEY =
  /^(token|sessionToken|accessToken|refreshToken|password|authorization|cookie|set-cookie)$/i;

export function fingerprint(value: string): string {
  if (value.length <= 8) return `tok:****(len ${value.length})`;
  return `tok:${value.slice(0, 6)}…(len ${value.length})`;
}

function redactString(input: string): string {
  return (
    input
      // Bearer <token>
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, (m) => `Bearer ${fingerprint(m.slice(7).trim())}`)
      // Signed S3 asset URL params and generic token query params
      .replace(
        /([?&](?:token|X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|Expires)=)([^&#]+)/gi,
        (_a, p: string, v: string) => `${p}${fingerprint(v)}`
      )
  );
}

export function redact(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY.test(key) && typeof value === 'string') {
    return fingerprint(value);
  }
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k);
    }
    return out;
  }
  return value;
}
