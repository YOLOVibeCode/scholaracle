/**
 * SyncScreen — manages the full Canvas on-device sync flow:
 *
 *   Phase A (Login): Shows a visible WebView at the Canvas URL so the user
 *                    can authenticate (handles MFA/SSO/CAPTCHA naturally).
 *                    Detects login success by URL pattern.
 *
 *   Phase B (Sync):  Replaces the visible WebView with a hidden one,
 *                    runs the canvas-recipe, transforms + validates + uploads.
 *
 * Credentials are loaded from Keychain. The WebView's cookie store persists
 * session state so repeated syncs usually skip the login phase.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { SyncWebView } from '../scraper/SyncWebView';
import { WebViewPageDriver } from '../scraper/WebViewPageDriver';
import { runSyncPipeline, SyncError, type ISyncProgress } from '../scraper/SyncOrchestrator';
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
  canvas: 'com.instructure.canvas',
  skyward: 'com.skyward.iscorp',
  aeries: 'com.aeries.portal',
};

const ADAPTER_VERSION = '0.1.0';

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
  const [error, setError] = useState<string | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const hasStartedSync = useRef(false);
  // Set when the user cancels mid-sync; suppresses further state updates
  // from the (still running) pipeline after we leave the screen.
  const cancelledRef = useRef(false);

  // Load credentials from Keychain on mount
  useEffect(() => {
    SecureStore.getItemAsync(credentialKey)
      .then((raw) => {
        if (!raw) {
          setError('No credentials found. Please reconnect your portal.');
          setSyncState('error');
          return;
        }
        const cred = JSON.parse(raw) as ISavedCredential;
        setCredential(cred);
        setSyncState('login');
        setShowWebView(true);
      })
      .catch(() => {
        setError('Failed to load credentials.');
        setSyncState('error');
      });
  }, [credentialKey]);

  const handleLoginSuccess = useCallback(
    async (_url: string): Promise<void> => {
      // SyncWebView only invokes onLoginSuccess after shouldTreatAsLoginSuccess
      // passes (first load complete, off the initial URL, on the portal host,
      // not a login/SSO page) — no re-detection needed here.
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
          }
        );
        if (cancelledRef.current) return;
        setSyncState('done');
      } catch (err: unknown) {
        if (cancelledRef.current) return;
        const msg = err instanceof Error ? err.message : 'Sync failed';
        setError(msg);
        setSyncState('error');

        if (err instanceof SyncError && err.phase === 'portal') {
          Alert.alert('Session Expired', 'Your portal session has expired. Please log in again.', [
            {
              text: 'OK',
              onPress: (): void => {
                hasStartedSync.current = false;
                setSyncState('login');
                setShowWebView(true);
              },
            },
          ]);
        }
      }
    },
    [config]
  );

  const handleCancelSync = useCallback((): void => {
    cancelledRef.current = true;
    (onCancel ?? onDone)();
  }, [onCancel, onDone]);

  return (
    <View style={styles.container}>
      {/* Login WebView (visible only during login phase) */}
      {credential && (
        <SyncWebView
          driver={driverRef.current}
          visible={showWebView && syncState === 'login'}
          initialUrl={credential.baseUrl}
          onLoginSuccess={handleLoginSuccess}
        />
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
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.button} onPress={onDone}>
                <Text style={styles.buttonText}>Close</Text>
              </TouchableOpacity>
              {onCancel ? (
                <TouchableOpacity onPress={onCancel}>
                  <Text style={styles.cancelLink}>Back</Text>
                </TouchableOpacity>
              ) : null}
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
