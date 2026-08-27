/**
 * Decode a JWT payload without verification.
 * Edge-safe (uses atob, no Buffer/crypto). Returns null on any parse failure.
 */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob !== 'undefined' ? atob(base64) : '';
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Returns the `exp` claim in seconds, or null if absent / unreadable. */
export function getTokenExp(token: string): number | null {
  const payload = decodePayload(token);
  return typeof payload?.['exp'] === 'number' ? (payload['exp'] as number) : null;
}

/** Returns the `email` claim, or null if absent / unreadable. */
export function getTokenEmail(token: string | null): string | null {
  if (!token || typeof token !== 'string') return null;
  const payload = decodePayload(token);
  return typeof payload?.['email'] === 'string' ? (payload['email'] as string) : null;
}

/** Returns the `role` claim. Missing role on a readable token is treated as parent. */
export function getTokenRole(token: string | null): 'parent' | 'student' | null {
  if (!token || typeof token !== 'string') return null;
  const payload = decodePayload(token);
  if (!payload) return null;
  if (payload['role'] === 'student') return 'student';
  if (payload['role'] === 'parent') return 'parent';
  if (typeof payload['userId'] === 'string') return 'parent';
  return null;
}
