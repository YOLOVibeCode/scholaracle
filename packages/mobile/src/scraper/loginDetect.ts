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
 * - Never on login pages, Google SSO interstitials, or about:blank.
 * - When a portal hostname is known, the URL's hostname must equal it
 *   exactly — an unparseable ('') hostname never matches.
 */
export function shouldTreatAsLoginSuccess(params: ILoginSuccessParams): boolean {
  const { url, initialUrl, hasCompletedLoad, portalHostname } = params;
  if (!hasCompletedLoad) return false;
  if (!url || url === 'about:blank') return false;
  if (isSameNormalizedUrl(url, initialUrl)) return false;
  if (url.includes('/login')) return false;
  if (url.includes('accounts.google.com')) return false;
  if (portalHostname !== '') {
    const urlHostname = extractHostname(url);
    if (urlHostname === '' || urlHostname !== portalHostname.toLowerCase()) return false;
  }
  return true;
}

export interface IPopupNavigationParams {
  /** URL of the navigation request being intercepted. */
  readonly requestUrl: string;
  /** URL the WebView was initially pointed at. */
  readonly initialUrl: string;
  /** react-native-webview navigationType for the request. */
  readonly navigationType: string;
  /** True once the WebView fired its first onLoadEnd. */
  readonly hasCompletedLoad: boolean;
}

/**
 * Decide whether to cancel a navigation request and route it through the
 * in-frame popup handler instead (Skyward opens content via window.open).
 *
 * Never blocks before the first load completes — cancelling the initial
 * request left Skyward stuck on a blank page.
 */
export function shouldBlockPopupNavigation(params: IPopupNavigationParams): boolean {
  const { requestUrl, initialUrl, navigationType, hasCompletedLoad } = params;
  if (!hasCompletedLoad) return false;
  if (navigationType !== 'other') return false;
  if (isSameNormalizedUrl(requestUrl, initialUrl)) return false;
  return requestUrl.includes('skyward');
}
