import type { Request } from 'express';
import { AuthenticationError, ForbiddenError } from '@scholaracle/contracts';
import type { IAuthenticatedRequest } from '../../middleware/auth';

/**
 * Identity helpers shared by every sharing route (students `/contacts*`, `/parents*` and
 * `/api/sharing/*`). Sharing trusts ONLY the verified JWT: never an email in a body or query.
 */

/** User id from the verified JWT, or null when the auth middleware did not run. */
export function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

/** Email from the verified JWT (lower-cased), or null. */
export function getUserEmail(req: Request): string | null {
  const email = (req as IAuthenticatedRequest).userEmail;
  return typeof email === 'string' && email.trim() !== '' ? email.trim().toLowerCase() : null;
}

/**
 * Sharing routes accept an optional `email` in the body for older clients. It must be the caller's
 * own address; anything else is refused so a signed-in user cannot act on someone else's invitation.
 */
export function requireOwnEmail(req: Request, bodyEmail: unknown): string {
  const own = getUserEmail(req);
  if (own === null) {
    throw new AuthenticationError('Unauthorized');
  }
  if (typeof bodyEmail === 'string' && bodyEmail.trim() !== '') {
    if (bodyEmail.trim().toLowerCase() !== own) {
      throw new ForbiddenError('You can only act on invitations sent to your own email');
    }
  }
  return own;
}

/** The caller's user id, or 401 when missing. */
export function requireUserId(req: Request): string {
  const userId = getUserId(req);
  if (!userId) {
    throw new AuthenticationError('Unauthorized');
  }
  return userId;
}
