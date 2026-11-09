/**
 * Sync-all keeps one WebView mounted for the whole queue so portal cookies survive
 * between serialized child syncs on the same host (Android/iOS).
 */

export function shouldKeepSyncAllWebViewMounted(params: {
  readonly hasCredential: boolean;
  readonly keepWebViewMounted: boolean;
}): boolean {
  return params.hasCredential && params.keepWebViewMounted;
}
