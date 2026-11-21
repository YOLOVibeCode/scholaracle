/**
 * Pure shapes for deleting an account with a fresh Sign in with Apple. Kept apart from
 * appleProof.ts (which loads native modules) so it can be unit-tested.
 */

export interface IAppleProof {
  readonly identityToken: string;
  /** Raw nonce; Apple was given its SHA-256, the server re-hashes and compares. */
  readonly nonce: string;
  /**
   * One-time code from the same sign-in (valid 5 minutes). The server exchanges it to revoke
   * the user's Apple tokens when the account is deleted (App Review 5.1.1(v)).
   * Null when Apple returned none; deletion still goes ahead.
   */
  readonly authorizationCode: string | null;
}

/** Body of DELETE /api/account for an Apple confirmation. */
export interface IAppleDeleteRequest {
  readonly appleIdentityToken: string;
  readonly appleNonce: string;
  readonly appleAuthorizationCode?: string;
}

export function appleDeleteRequest(proof: IAppleProof): IAppleDeleteRequest {
  const base = { appleIdentityToken: proof.identityToken, appleNonce: proof.nonce };
  return proof.authorizationCode === null || proof.authorizationCode === ''
    ? base
    : { ...base, appleAuthorizationCode: proof.authorizationCode };
}
