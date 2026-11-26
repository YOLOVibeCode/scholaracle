/**
 * Tell a @sendgrid/mail service that its key is a relay key.
 *
 * The library checks that an API key starts with "SG." and prints
 * `API key does not start with "SG.".` when it does not. Mail that goes through a
 * SendGrid-compatible relay is signed with the relay's key, which never has that prefix,
 * so every setApiKey call printed a false warning. Call this once the relay is the
 * destination: from then on any non-empty key passes the check. An empty key is still
 * reported.
 *
 * Only the check changes. The key, the Authorization header and the base URL are set by
 * the library exactly as before.
 */
export function acceptRelayKeys(mailService: unknown): void {
  const client = (mailService as { client?: { isValidApiKey?: (key: unknown) => boolean } } | null)
    ?.client;
  if (!client || typeof client.isValidApiKey !== 'function') return;
  client.isValidApiKey = (key: unknown): boolean => typeof key === 'string' && key.trim() !== '';
}
