import { getTokenEmail, getTokenUserId } from '@/lib/jwt';

/** Who is signed in on this browser, read from the parent JWT (no network). */
export interface ISessionUser {
  readonly userId: string;
  readonly email: string;
}

/**
 * The signed-in parent, or null when there is no readable token. Sharing screens use it to
 * find the viewer's own row (the API compares the JWT's email and user id the same way).
 */
export function getSessionUser(
  storage: Pick<Storage, 'getItem'> | null = typeof window === 'undefined' ? null : localStorage
): ISessionUser | null {
  const token = storage?.getItem('auth_token') ?? null;
  const userId = getTokenUserId(token);
  const email = getTokenEmail(token);
  if (userId === null || email === null) return null;
  return { userId, email: email.toLowerCase() };
}
