/** Accepted `aud` values for Apple identity tokens (comma-separated env, default: the iOS bundle id). */
export function appleOAuthAudiences(): string[] {
  const raw = process.env['APPLE_OAUTH_AUDIENCE'] ?? 'com.scholarmancy.app';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
