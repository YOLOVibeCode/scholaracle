/**
 * SyncWebView — renders a <WebView> and wires it to a WebViewPageDriver.
 *
 * Usage:
 *   const driver = useRef(new WebViewPageDriver());
 *   <SyncWebView driver={driver.current} visible={false} initialUrl="about:blank" />
 *
 * When visible=false the WebView runs headlessly (0x0 off-screen).
 * When visible=true it is shown for user-facing login.
 */

import React, { useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent, WebViewNavigation, WebViewProps } from 'react-native-webview';
import type { WebViewPageDriver } from './WebViewPageDriver';

// react-native-webview's class component types collapse to `never` under
// React 19 typings; re-type the component with its documented props.
const WebViewComponent = WebView as unknown as React.ForwardRefExoticComponent<
  WebViewProps & React.RefAttributes<WebView>
>;

interface ISyncWebViewProps {
  readonly driver: WebViewPageDriver;
  readonly visible: boolean;
  readonly initialUrl?: string;
  readonly onLoginSuccess?: (url: string) => void;
}

export interface ISyncWebViewRef {
  readonly webView: WebView | null;
}

export const SyncWebView = forwardRef<ISyncWebViewRef, ISyncWebViewProps>(
  ({ driver, visible, initialUrl = 'about:blank', onLoginSuccess }, ref) => {
    const webViewRef = useRef<WebView>(null);

    useImperativeHandle(ref, () => ({
      get webView() {
        return webViewRef.current;
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
        // The driver ignores the payload; error events are safe to pass through.
        driver.webViewHandlers.onLoadEnd(event.nativeEvent as WebViewNavigation);
      },
      [driver]
    );

    const handleNavChange = useCallback(
      (state: WebViewNavigation) => {
        driver.webViewHandlers.onNavigationStateChange(state);
        if (onLoginSuccess && state.url && state.url !== initialUrl) {
          onLoginSuccess(state.url);
        }
      },
      [driver, initialUrl, onLoginSuccess]
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
          onShouldStartLoadWithRequest={(request) => {
            // Intercept Skyward-style popup navigations (target="_blank" or JS window.open)
            // and handle them in-frame instead of opening a new window.
            if (request.navigationType === 'other' && request.url !== initialUrl) {
              if (request.url.includes('skyward') && request.url !== initialUrl) {
                void driver.handlePopupNavigation(request.url);
                return false;
              }
            }
            return true;
          }}
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
