/**
 * Which provider button the native login screen shows (used by NativeOAuthButtons).
 *
 * Only Sign in with Apple, on iOS. The API checks Apple's identity token itself, so the
 * app sends nothing the API has to take on trust. Google and Microsoft need the same kind
 * of check on the API before they can be offered here: the app is public, so it can never
 * hold a secret that vouches for who someone is.
 */

export function nativeOAuthButtonFlags(os: string): { readonly apple: boolean } {
  return { apple: os === 'ios' };
}
