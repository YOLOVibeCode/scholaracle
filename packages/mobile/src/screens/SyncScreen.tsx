/**
 * SyncScreen — manages the full Canvas on-device sync flow:
 *
 *   Phase A (Login): Shows a visible WebView at the portal URL so the user
 *                    can authenticate (handles MFA/SSO/CAPTCHA naturally).
 *                    The sync starts when the parent taps "I'm signed in,
 *                    continue", or on its own when a finished navigation
 *                    lands on the portal and the page shows no sign-in form.
 *                    Cancel (and Android back, with no page history) leaves.
 *
 *   Phase B (Sync):  Replaces the visible WebView with a hidden one,
 *                    runs the canvas-recipe, transforms + validates + uploads.
 *
 * Credentials are loaded from Keychain. The WebView's cookie store persists
 * session state so repeated syncs usually skip the login phase.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  BackHandler,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { isLoginFormShowing } from '@scholaracle/scraper-core';
import { SyncWebView, type ISyncWebViewRef } from '../scraper/SyncWebView';
import { describeSyncFailure, type ISyncFailureView } from '../scraper/loginDetect';
import { extractHostname } from '../utils/urlNormalize';
import { WebViewPageDriver } from '../scraper/WebViewPageDriver';
import { runSyncPipeline, SyncError, type ISyncProgress } from '../scraper/SyncOrchestrator';
import { WebViewAssetHost } from '../scraper/WebViewAssetHost';
import { apiClient } from '../api/client';
import { runLedger } from '../ledger/RunLedger';

interface ISavedCredential {
  readonly username: string;
  readonly password: string;
  readonly baseUrl: string;
  readonly provider: 'canvas' | 'skyward' | 'aeries';
  readonly loginMethod: string;
}

interface ISyncConfig {
  readonly provider: 'canvas' | 'skyward' | 'aeries';
  readonly adapterId: string;
  readonly baseUrl: string;
  readonly studentExternalId: string;
  readonly institutionExternalId: string;
  readonly sourceId: string;
}

interface ISyncScreenProps {
  readonly credentialKey: string;
  readonly config: ISyncConfig;
  onDone(): void;
  onCancel?(): void;
}

type SyncState = 'loading-creds' | 'login' | 'syncing' | 'done' | 'error';

const ADAPTER_IDS: Record<string, string> = {
  canvas: 'canvas',
  skyward: 'skyward',
  aeries: 'aeries',
};

const ADAPTER_VERSION = '0.1.0';

/** How long to wait for the page to answer "is a sign-in form showing?". */
const LOGIN_CHECK_TIMEOUT_MS = 5000;

function localFailure(message: string): ISyncFailureView {
  return describeSyncFailure({ phase: 'local', message, provider: '', loginFormShowing: false });
}

export function SyncScreen({
  credentialKey,
  config,
  onDone,
  onCancel,
}: ISyncScreenProps): React.ReactElement {
  const driverRef = useRef(new WebViewPageDriver());
  const [syncState, setSyncState] = useState<SyncState>('loading-creds');
  const [credential, setCredential] = useState<ISavedCredential | null>(null);
  const [progress, setProgress] = useState<ISyncProgress | null>(null);
  const [failure, setFailure] = useState<ISyncFailureView | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const webViewRef = useRef<ISyncWebViewRef>(null);
  const hasStartedSync = useRef(false);
  // True while an automatic sign-in check is running, so overlapping
  // navigations do not start two checks.
  const isCheckingLoginRef = useRef(false);
  // Set when the user cancels mid-sync; suppresses further state updates
  // from the (still running) pipeline after we leave the screen.
  const cancelledRef = useRef(false);

  // Load credentials from Keychain on mount
  useEffect(() => {
    SecureStore.getItemAsync(credentialKey)
      .then((raw) => {
        if (!raw) {
          setFailure(localFailure('No saved sign-in for this portal. Please reconnect it.'));
          setSyncState('error');
          return;
        }
        const cred = JSON.parse(raw) as ISavedCredential;
        setCredential(cred);
        setSyncState('login');
        setShowWebView(true);
      })
      .catch(() => {
        setFailure(localFailure('Couldn\u2019t read the saved sign-in on this phone.'));
        setSyncState('error');
      });
  }, [credentialKey]);

  /**
   * Ask the page whether it still shows a sign-in form. null: no answer within
   * LOGIN_CHECK_TIMEOUT_MS (the page may be navigating), or the check failed.
   */
  const checkLoginForm = useCallback(async (): Promise<boolean | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        driverRef.current.evaluate(isLoginFormShowing),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), LOGIN_CHECK_TIMEOUT_MS);
        }),
      ]);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }, []);

  const startSync = useCallback(async (): Promise<void> => {
    if (hasStartedSync.current) return;
    hasStartedSync.current = true;

    setSyncState('syncing');
    setShowWebView(false); // Switch to hidden WebView

    try {
      const connectorToken = await apiClient.getOrMintConnectorToken();
      // Idempotent upsert: guarantees the source exists server-side so the
      // run appears in GET /:id/sources history (heals older installs whose
      // sources were only stored locally). Best-effort — a registration
      // failure must not block the sync itself.
      try {
        await apiClient.registerIngestSource({
          sourceId: config.sourceId,
          provider: config.provider,
          adapterId: ADAPTER_IDS[config.provider] ?? config.adapterId,
          displayName: `${config.provider} (${config.institutionExternalId})`,
          portalBaseUrl: config.baseUrl,
        });
      } catch (registerErr: unknown) {
        console.warn('registerIngestSource failed; continuing with sync', registerErr);
      }
      await runSyncPipeline(
        driverRef.current,
        {
          provider: config.provider,
          adapterId: ADAPTER_IDS[config.provider] ?? config.adapterId,
          baseUrl: config.baseUrl,
          studentExternalId: config.studentExternalId,
          institutionExternalId: config.institutionExternalId,
          sourceId: config.sourceId,
          adapterVersion: ADAPTER_VERSION,
        },
        apiClient,
        connectorToken,
        runLedger,
        (p: ISyncProgress) => {
          if (!cancelledRef.current) setProgress(p);
        },
        undefined,
        new WebViewAssetHost({
          driver: driverRef.current,
          connectorToken,
          sourceId: config.sourceId,
          provider: config.provider,
          // Derive portal origin via string parsing — no URL API in React Native.
          portalOrigin: config.baseUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1'),
          apiBaseUrl: apiClient.baseUrlValue,
        })
      );
      if (cancelledRef.current) return;
      setSyncState('done');
    } catch (err: unknown) {
      if (cancelledRef.current) return;
      const message = err instanceof Error ? err.message : 'Sync failed';
      const phase = err instanceof SyncError ? err.phase : undefined;
      // Only call it "signed out" when the portal really shows a sign-in form.
      const loginFormShowing = phase === 'portal' ? (await checkLoginForm()) === true : false;
      if (cancelledRef.current) return;
      setFailure(
        describeSyncFailure({ phase, message, provider: config.provider, loginFormShowing })
      );
      setSyncState('error');
    }
  }, [config, checkLoginForm]);

  /** A finished navigation on the portal: start only if no sign-in form is showing. */
  const handleLoginCandidate = useCallback(
    async (_url: string): Promise<void> => {
      if (hasStartedSync.current || isCheckingLoginRef.current) return;
      isCheckingLoginRef.current = true;
      try {
        const showing = await checkLoginForm();
        if (showing === false) await startSync();
        // true: still signing in. null: unknown; the parent can tap Continue.
      } finally {
        isCheckingLoginRef.current = false;
      }
    },
    [checkLoginForm, startSync]
  );

  /** "I'm signed in, continue". */
  const handleContinue = useCallback(async (): Promise<void> => {
    if (hasStartedSync.current) return;
    const showing = await checkLoginForm();
    if (showing === true) {
      Alert.alert(
        'Still on the sign-in page?',
        'This page still shows a password box. Finish signing in first, or continue anyway.',
        [
          { text: 'Keep signing in', style: 'cancel' },
          { text: 'Continue anyway', onPress: (): void => void startSync() },
        ]
      );
      return;
    }
    await startSync();
  }, [checkLoginForm, startSync]);

  const handleSignInAgain = useCallback((): void => {
    hasStartedSync.current = false;
    setFailure(null);
    setProgress(null);
    setSyncState('login');
    setShowWebView(true);
  }, []);

  const handleCancelSync = useCallback((): void => {
    cancelledRef.current = true;
    (onCancel ?? onDone)();
  }, [onCancel, onDone]);

  // Android back: page history first while signing in, otherwise leave.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', (): boolean => {
      if (syncState === 'login' && webViewRef.current?.canGoBack) {
        webViewRef.current.goBack();
        return true;
      }
      if (syncState === 'error' || syncState === 'done') {
        onDone();
        return true;
      }
      handleCancelSync();
      return true;
    });
    return (): void => sub.remove();
  }, [syncState, handleCancelSync, onDone]);

  const portalHost = credential ? extractHostname(credential.baseUrl) : '';

  return (
    <View style={styles.container}>
      {/* Sign-in bar (login phase only). Kept before the WebView, which must
          stay mounted at the same position so the portal session survives. */}
      {syncState === 'login' && (
        <View style={styles.loginBar}>
          <Text style={styles.loginHost} numberOfLines={1} testID="text-login-host">
            Sign in to {portalHost || 'your school portal'}
          </Text>
          <TouchableOpacity onPress={handleCancelSync} testID="button-cancel-login">
            <Text style={styles.loginCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Login WebView (visible only during login phase) */}
      {credential && (
        <SyncWebView
          ref={webViewRef}
          driver={driverRef.current}
          visible={showWebView && syncState === 'login'}
          initialUrl={credential.baseUrl}
          onLoginCandidate={(url): void => void handleLoginCandidate(url)}
        />
      )}

      {syncState === 'login' && (
        <View style={styles.loginFooter}>
          <TouchableOpacity
            style={styles.button}
            onPress={(): void => void handleContinue()}
            testID="button-signed-in-continue"
          >
            <Text style={styles.buttonText}>I’m signed in, continue</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Progress overlay */}
      {syncState !== 'login' && (
        <View style={styles.overlay}>
          {syncState === 'loading-creds' && (
            <>
              <ActivityIndicator size="large" color="#4361ee" />
              <Text style={styles.statusText}>Loading credentials...</Text>
            </>
          )}

          {syncState === 'syncing' && (
            <>
              <ActivityIndicator size="large" color="#4361ee" />
              <Text style={styles.statusText}>{progress?.message ?? 'Syncing...'}</Text>
              {progress?.opCount !== undefined && (
                <Text style={styles.subText}>{progress.opCount} operations</Text>
              )}
              <TouchableOpacity onPress={handleCancelSync} testID="button-cancel-sync">
                <Text style={styles.cancelLink}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {syncState === 'done' && (
            <>
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.statusText}>Sync complete!</Text>
              {progress?.opCount !== undefined && (
                <Text style={styles.subText}>{progress.opCount} records updated</Text>
              )}
              <TouchableOpacity style={styles.button} onPress={onDone}>
                <Text style={styles.buttonText}>Done</Text>
              </TouchableOpacity>
            </>
          )}

          {syncState === 'error' && (
            <>
              <Text style={styles.errorIcon}>✕</Text>
              <Text style={styles.errorTitle} testID="text-sync-failure-title">
                {failure?.title ?? 'Sync failed'}
              </Text>
              <Text style={styles.errorText} testID="text-sync-failure-message">
                {failure?.message ?? ''}
              </Text>
              {failure?.canSignInAgain && credential ? (
                <TouchableOpacity
                  style={styles.button}
                  onPress={handleSignInAgain}
                  testID="button-sign-in-again"
                >
                  <Text style={styles.buttonText}>Sign in again</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={onDone} testID="button-close-sync">
                <Text style={styles.cancelLink}>Close</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#f8f9fa',
  },
  statusText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    marginTop: 20,
    textAlign: 'center',
  },
  subText: { fontSize: 14, color: '#6c757d', marginTop: 8 },
  successIcon: { fontSize: 64, color: '#28a745' },
  errorIcon: { fontSize: 64, color: '#dc3545' },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a2e',
    marginTop: 12,
    textAlign: 'center',
  },
  loginBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  loginHost: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a2e', marginRight: 12 },
  loginCancel: { color: '#4361ee', fontSize: 15 },
  loginFooter: {
    alignItems: 'center',
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#dee2e6',
  },
  errorText: {
    fontSize: 15,
    color: '#dc3545',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#4361ee',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  cancelLink: { color: '#4361ee', marginTop: 16, fontSize: 15 },
});
