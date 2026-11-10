import { ApiError } from '../api/ApiError';

/** Plain-language message for a failed deletion. Pure so it can be tested. */
export function deleteFailureMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 401) {
    return 'That did not match your account. Check your password, or confirm with Apple, and try again.';
  }
  if (err instanceof ApiError && err.status === 400) {
    return 'Enter your password, or confirm with Apple, to continue.';
  }
  return 'Could not delete your account. Check your connection and try again. Nothing was deleted.';
}
