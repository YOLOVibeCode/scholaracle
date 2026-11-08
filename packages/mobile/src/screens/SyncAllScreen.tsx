/**
 * Runs multiple on-device syncs for one portal login without tearing down the WebView.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { runSyncPipeline, SyncError, type ISyncProgress } from '../scraper/SyncOrchestrator';
import { SyncWebView, type ISyncWebViewRef } from '../scraper/SyncWebView';
import { describeSyncFailure, type ISyncFailureView } from '../scraper/loginDetect';
import { WebViewPageDriver } from '../scraper/WebViewPageDriver';
import { WebViewAssetHost } from '../scraper/WebViewAssetHost';
import { apiClient } from '../api/client';
import type { IConnectedSource } from '../sources/ConnectedSourceStore';
import { ensureBindingAfterSync } from '../sources/ensureBindingAfterSync';
import { runLedger } from '../ledger/RunLedger';
import type { ISyncOrchestratorConfig } from '../scraper/SyncOrchestrator';

interface ISyncAllItem {
  readonly config: ISyncOrchestratorConfig;
  readonly studentNameHint: string;
  readonly connectedSource: IConnectedSource;
}

interface ISyncAllScreenProps {
  readonly credentialKey: string;
  readonly items: readonly ISyncAllItem[];
  onDone(): void;
  onCancel?(): void;
}

interface ISavedCredential {
  readonly username: string;
  readonly password: string;
  readonly baseUrl: string;
  readonly provider: 'canvas' | 'skyward' | 'aeries';
  readonly loginMethod: string;
}

type SyncState = 'loading-creds' | 'login' | 'syncing' | 'done' | 'error';

export function SyncAllScreen({
  credentialKey,
  items,
  onDone,
  onCancel,
}: ISyncAllScreenProps): React.ReactElement {
  const driverRef = useRef(new WebViewPageDriver());
  const webViewRef = useRef<ISyncWebViewRef>(null);
  const [syncState, setSyncState] = useState<SyncState>('loading-creds');
  const [credential, setCredential] = useState<ISavedCredential | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  const [progress, setProgress] = useState<ISyncProgress | null>(null);
  const [failure, setFailure] = useState<ISyncFailureView | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const hasPortalSession = useRef(false);
  const isRunning = useRef(false);
  const keepWebViewMounted = useRef(true);

  const activeItem = items[queueIndex];

  useEffect(() => {
    SecureStore.getItemAsync(credentialKey)
      .then((raw) => {
        if (!raw) {
          setFailure(
            describeSyncFailure({
              phase: 'local',
              message: 'Missing credentials',
              provider: items[0]?.config.provider ?? 'canvas',
              loginFormShowing: false,
            })
          );
          setSyncState('error');
          return;
        }
        setCredential(JSON.parse(raw) as ISavedCredential);
        setSyncState('login');
        setShowWebView(true);
      })
      .catch(() => {
        setSyncState('error');
      });
  }, [credentialKey]);

  const runActiveSync = useCallback(
    async (index: number): Promise<void> => {
      const item = items[index];
      if (!item || isRunning.current) return;
      isRunning.current = true;
      setSyncState('syncing');
      setShowWebView(false);
      try {
        const connectorToken = await apiClient.getOrMintConnectorToken();
        await runSyncPipeline(
          driverRef.current,
          {
            ...item.config,
            studentNameHint: item.studentNameHint,
          },
          apiClient,
          connectorToken,
          runLedger,
          (p: ISyncProgress) => setProgress(p),
          undefined,
          new WebViewAssetHost({
            driver: driverRef.current,
            connectorToken,
            sourceId: item.config.sourceId,
            provider: item.config.provider,
            portalOrigin: item.config.baseUrl.replace(/^(https?:\/\/[^/]+).*$/, '$1'),
            apiBaseUrl: apiClient.baseUrlValue,
          })
        );
        try {
          await ensureBindingAfterSync({
            source: item.connectedSource,
            registrar: apiClient,
          });
        } catch {
          // Binding registration is best-effort after a successful sync.
        }
        hasPortalSession.current = true;
        if (index < items.length - 1) {
          setQueueIndex(index + 1);
          isRunning.current = false;
          await runActiveSync(index + 1);
          return;
        }
        setSyncState('done');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Sync failed';
        const phase = err instanceof SyncError ? err.phase : undefined;
        setFailure(
          describeSyncFailure({
            phase,
            message,
            provider: item.config.provider,
            loginFormShowing: false,
          })
        );
        setSyncState('error');
      } finally {
        isRunning.current = false;
      }
    },
    [items]
  );

  const handleContinue = useCallback((): void => {
    void runActiveSync(queueIndex);
  }, [queueIndex, runActiveSync]);

  return (
    <View style={styles.container} testID="sync-all-screen">
      {credential && keepWebViewMounted.current ? (
        <SyncWebView
          ref={webViewRef}
          driver={driverRef.current}
          visible={showWebView && syncState === 'login'}
          initialUrl={credential.baseUrl}
        />
      ) : null}

      {syncState === 'login' && (
        <TouchableOpacity
          style={styles.button}
          onPress={handleContinue}
          testID="button-sync-all-continue"
        >
          <Text style={styles.buttonText}>I’m signed in, sync all children</Text>
        </TouchableOpacity>
      )}

      {syncState === 'syncing' && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#4361ee" />
          <Text style={styles.statusText}>
            Syncing {activeItem?.studentNameHint ?? 'student'} ({queueIndex + 1}/{items.length})
          </Text>
          <Text style={styles.subText}>{progress?.message ?? ''}</Text>
        </View>
      )}

      {syncState === 'done' && (
        <View style={styles.overlay}>
          <Text style={styles.statusText}>All students synced</Text>
          <TouchableOpacity style={styles.button} onPress={onDone} testID="button-sync-all-done">
            <Text style={styles.buttonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {syncState === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.statusText}>{failure?.message ?? 'Sync failed'}</Text>
          <TouchableOpacity style={styles.button} onPress={onCancel ?? onDone}>
            <Text style={styles.buttonText}>Close</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  statusText: { fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' },
  subText: { fontSize: 14, color: '#6c757d', marginTop: 8, textAlign: 'center' },
  button: {
    marginTop: 16,
    backgroundColor: '#4361ee',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    alignSelf: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
