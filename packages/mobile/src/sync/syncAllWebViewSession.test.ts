import { shouldKeepSyncAllWebViewMounted } from './syncAllWebViewSession';

describe('syncAllWebViewSession', () => {
  it('keeps WebView mounted while credentials are loaded and the queue runs', () => {
    expect(shouldKeepSyncAllWebViewMounted({ hasCredential: true, keepWebViewMounted: true })).toBe(
      true
    );
  });

  it('does not mount WebView before credentials are available', () => {
    expect(
      shouldKeepSyncAllWebViewMounted({ hasCredential: false, keepWebViewMounted: true })
    ).toBe(false);
  });
});
