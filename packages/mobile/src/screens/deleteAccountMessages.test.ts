import { ApiError } from '../api/ApiError';
import { deleteFailureMessage } from './deleteAccountMessages';

function apiError(status: number): ApiError {
  return new ApiError(`HTTP ${status}`, status);
}

describe('deleteFailureMessage', () => {
  it('explains a 401 as a proof mismatch, not a server problem', () => {
    expect(deleteFailureMessage(apiError(401))).toMatch(/did not match/i);
  });
  it('explains a 400 as missing proof', () => {
    expect(deleteFailureMessage(apiError(400))).toMatch(/password, or confirm with Apple/i);
  });
  it('says nothing was deleted on network or server failures', () => {
    expect(deleteFailureMessage(new Error('Network request failed'))).toMatch(
      /nothing was deleted/i
    );
    expect(deleteFailureMessage(apiError(500))).toMatch(/nothing was deleted/i);
  });
});
