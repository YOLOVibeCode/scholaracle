/**
 * Pure login/navigation detection for SyncWebView.
 *
 * Kept free of react-native imports so the logic is unit-testable in the
 * node-env jest harness. All URL comparison is string-based (see urlNormalize).
 */

import { extractHostname, isSameNormalizedUrl } from '../utils/urlNormalize';

export interface ILoginSuccessParams {
  /** URL reported by onNavigationStateChange. */
  readonly url: string;
  /** URL the WebView was initially pointed at. */
  readonly initialUrl: string;
  /** True once the WebView fired its first onLoadEnd. */
  readonly hasCompletedLoad: boolean;
  /** Expected portal hostname ('' disables the hostname check). */
  readonly portalHostname: string;
}

/**
 * Decide whether a navigation event means the user finished logging in.
 *
 * - Never before the first load completes (the FIRST load of 'https://x.com'
 *   is often reported as 'https://x.com/', which used to look like a
 *   post-login navigation).
 * - Never when the URL is just a normalized variant of the initial URL
 *   (trailing slash / casing).
 * - Never on login pages (any "/login…" path, any case), Google SSO
 *   interstitials, or about:blank.
 * - The caller still checks the page for a visible password field before
 *   starting (isLoginFormShowing); this is only the cheap first filter.
 * - When a portal hostname is known, the URL's hostname must equal it
 *   exactly — an unparseable ('') hostname never matches.
 */
export function shouldTreatAsLoginSuccess(params: ILoginSuccessParams): boolean {
  const { url, initialUrl, hasCompletedLoad, portalHostname } = params;
  if (!hasCompletedLoad) return false;
  if (!url || url === 'about:blank') return false;
  if (isSameNormalizedUrl(url, initialUrl)) return false;
  if (/\/login/i.test(url)) return false;
  if (url.includes('accounts.google.com')) return false;
  if (portalHostname !== '') {
    const urlHostname = extractHostname(url);
    if (urlHostname === '' || urlHostname !== portalHostname.toLowerCase()) return false;
  }
  return true;
}

export type SyncFailureKind = 'signed-out' | 'portal' | 'upload' | 'local';

export interface ISyncFailureView {
  readonly kind: SyncFailureKind;
  readonly title: string;
  readonly message: string;
  /** Offer "Sign in again" (back to the visible portal). */
  readonly canSignInAgain: boolean;
}

const PROVIDER_LABEL: Record<string, string> = {
  canvas: 'Canvas',
  skyward: 'Skyward',
  aeries: 'Aeries',
};

/**
 * Turn a sync failure into what the parent sees. Only a failure that leaves
 * the portal on a sign-in form is called "signed out"; every other portal
 * failure shows the real reason instead of a blanket "Session Expired".
 */
export function describeSyncFailure(params: {
  readonly phase: 'portal' | 'upload' | 'local' | undefined;
  readonly message: string;
  readonly provider: string;
  readonly loginFormShowing: boolean;
}): ISyncFailureView {
  const portal = PROVIDER_LABEL[params.provider] ?? 'the portal';
  const reason = params.message.trim() || 'Unknown error';
  if (params.phase === 'portal' && params.loginFormShowing) {
    return {
      kind: 'signed-out',
      title: `Signed out of ${portal}`,
      message: `${portal} asked you to sign in again. Sign in, then tap “I’m signed in, continue”.`,
      canSignInAgain: true,
    };
  }
  if (params.phase === 'portal') {
    return {
      kind: 'portal',
      title: `Couldn’t read ${portal}`,
      message: reason,
      canSignInAgain: true,
    };
  }
  if (params.phase === 'upload') {
    return {
      kind: 'upload',
      title: 'Couldn’t save to Scholarmancy',
      message: `${reason} Your portal data was read; try again when you’re online.`,
      canSignInAgain: false,
    };
  }
  return { kind: 'local', title: 'Sync failed', message: reason, canSignInAgain: false };
}
