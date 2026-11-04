/**
 * SyncWebView — renders a <WebView> and wires it to a WebViewPageDriver.
 *
 * Usage:
 *   const driver = useRef(new WebViewPageDriver());
 *   <SyncWebView driver={driver.current} visible={false} initialUrl="about:blank" />
 *
 * When visible=false the WebView runs headlessly (0x0 off-screen).
 * When visible=true it is shown for user-facing login.
 *
 * Popups (window.open, target="_blank", forms posting into a named window)
 * continue in this same frame: POPUP_BOOT_JS rewrites them before the page's
 * scripts run, and onOpenWindow catches any the boot script missed.
 */

import React, { useRef, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation, WebViewProps } from 'react-native-webview';
import type { WebViewPageDriver } from './WebViewPageDriver';
import { extractHostname } from '../utils/urlNormalize';
import { shouldTreatAsLoginSuccess } from './loginDetect';
import { POPUP_BOOT_JS } from './popupBoot';

// react-native-webview's class component types collapse to `never` under
// React 19 typings; re-type the component with its documented props.
const WebViewComponent = WebView as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebView>
>;

interface ISyncWebViewProps {
  readonly driver: WebViewPageDriver;
  readonly visible: boolean;
  readonly initialUrl?: string;
  /**
   * Called when a finished navigation looks like the portal after sign-in.
   * The caller confirms (no sign-in form on the page) before starting a sync.
   */
  readonly onLoginCandidate?: (url: string) => void;
}

export interface ISyncWebViewRef {
  readonly webView: WebView | null;
  /** True when the WebView has history to go back to (Android back button). */
  readonly canGoBack: boolean;
  goBack(): void;
}

export const SyncWebView = forwardRef<ISyncWebViewRef, ISyncWebViewProps>(
  ({ driver, visible, initialUrl = 'about:blank', onLoginCandidate }, ref) => {
    const webViewRef = useRef<WebView>(null);
    // True once the first onLoadEnd has fired. Login detection and popup
    // blocking must never trigger on the initial page load.
    const hasCompletedLoadRef = useRef(false);
    const canGoBackRef = useRef(false);
    const portalHostname = useMemo(() => extractHostname(initialUrl), [initialUrl]);

    useImperativeHandle(ref, () => ({
      get webView(): WebView | null {
        return webViewRef.current;
      },
      get canGoBack(): boolean {
        return canGoBackRef.current;
      },
      goBack(): void {
        webViewRef.current?.goBack();
      },
    }));

    // Attach the driver's inject function once the ref is available
    const attachInject = useCallback(() => {
      driver.attachInject((js: string) => {
        webViewRef.current?.injectJavaScript(js);
      });
    }, [driver]);

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        driver.webViewHandlers.onMessage(event);
      },
      [driver]
    );

    const handleLoadEnd = useCallback<NonNullable<WebViewProps['onLoadEnd']>>(
      (event) => {
        hasCompletedLoadRef.current = true;
        // The driver ignores the payload; error events are safe to pass through.
        driver.webViewHandlers.onLoadEnd(event.nativeEvent as WebViewNavigation);
      },
      [driver]
    );

    const handleNavChange = useCallback(
      (state: WebViewNavigation): void => {
        driver.webViewHandlers.onNavigationStateChange(state);
        canGoBackRef.current = state.canGoBack === true;
        // Only a finished navigation can be checked for a sign-in form.
        if (state.loading === true) return;
        if (
          onLoginCandidate &&
          shouldTreatAsLoginSuccess({
            url: state.url,
            initialUrl,
            hasCompletedLoad: hasCompletedLoadRef.current,
            portalHostname,
          })
        ) {
          onLoginCandidate(state.url);
        }
      },
      [driver, initialUrl, onLoginCandidate, portalHostname]
    );

    const handleOpenWindow = useCallback<NonNullable<WebViewProps['onOpenWindow']>>(
      (event): void => {
        driver.handlePopupNavigation(event.nativeEvent.targetUrl).catch(() => undefined);
      },
      [driver]
    );

    return (
      <View style={visible ? styles.visible : styles.hidden}>
        <WebViewComponent
          ref={webViewRef}
          source={{ uri: initialUrl }}
          onLoad={attachInject}
          onMessage={handleMessage}
          onLoadEnd={handleLoadEnd}
          onNavigationStateChange={handleNavChange}
          injectedJavaScriptBeforeContentLoaded={POPUP_BOOT_JS}
          onOpenWindow={handleOpenWindow}
          javaScriptCanOpenWindowsAutomatically
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          cacheEnabled
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  visible: { flex: 1 },
  hidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
});
