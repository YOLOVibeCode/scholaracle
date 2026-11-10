/**
 * SettingsScreen — account (sign out), connected portals management,
 * notification permission status, and app version.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Linking,
  Switch,
  ActivityIndicator,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { connectedSourceStore, type IConnectedSource } from '../sources/ConnectedSourceStore';
import { groupSourcesByPortalAccount, portalAccountGroupKey } from '../sync/syncAllByPortalAccount';
import { STORE_LEGAL_URLS } from '../store/legalUrls';
import {
  DISCONNECT_LOCAL_LABEL,
  DISCONNECT_SERVER_LABEL,
  canDisconnectOnServer,
  disconnectConfirmText,
  disconnectFailureMessage,
  disconnectSource,
  type DisconnectMode,
} from '../sources/disconnectSource';
import { SERVER_AI_CONSENT_LABEL } from '@scholaracle/contracts';
import { fetchServerAiConsent, updateServerAiConsent } from '../api/serverAiConsent';
import { DeleteAccountSheet } from './DeleteAccountSheet';
import { canDisconnectOnServerAs } from '../sharing/accessMatrix';
import type { StudentAccess } from '@scholaracle/contracts';

interface ISettingsScreenProps {
  onBack(): void;
  /** Student sessions: sign out + notifications only. No portal disconnect. */
  readonly hideHousehold?: boolean;
  /**
   * Student id -> the viewer's access, from App's home data: members may only disconnect
   * "this phone only". Absent (unknown) keeps the server option; the server still decides.
   */
  readonly accessById?: ReadonlyMap<string, StudentAccess>;
  onSyncAll?(sources: readonly IConnectedSource[]): void;
  /** Opens the read-only Plan & usage screen (parent sessions only). */
  onOpenPlan?(): void;
  /** Parent sessions: opens the notification preferences screen. */
  onOpenNotificationSettings?(): void;
}

export function SettingsScreen({
  onBack,
  hideHousehold = false,
  accessById,
  onSyncAll,
  onOpenPlan,
  onOpenNotificationSettings,
}: ISettingsScreenProps): React.ReactElement {
  const { logout } = useAuth();
  const [sources, setSources] = useState<readonly IConnectedSource[]>([]);
  const [pushStatus, setPushStatus] = useState<string>('unknown');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showDeleteSheet, setShowDeleteSheet] = useState(false);
  const [serverAiEnabled, setServerAiEnabled] = useState(false);
  const [isServerAiLoading, setIsServerAiLoading] = useState(true);
  const [isServerAiSaving, setIsServerAiSaving] = useState(false);

  const loadSources = useCallback(async () => {
    if (hideHousehold) {
      setSources([]);
      return;
    }
    setSources(await connectedSourceStore.list());
  }, [hideHousehold]);

  const serverDisconnectAllowed = (source: IConnectedSource): boolean =>
    canDisconnectOnServer(source) &&
    canDisconnectOnServerAs(accessById?.get(source.studentId ?? ''));

  useEffect(() => {
    void loadSources();
    Notifications.getPermissionsAsync()
      .then(({ status }) => setPushStatus(status))
      .catch(() => setPushStatus('unknown'));
    if (!hideHousehold) {
      void fetchServerAiConsent()
        .then(setServerAiEnabled)
        .catch(() => setServerAiEnabled(false))
        .finally(() => setIsServerAiLoading(false));
    } else {
      setIsServerAiLoading(false);
    }
  }, [loadSources, hideHousehold]);

  const handleServerAiToggle = (next: boolean): void => {
    if (isServerAiSaving) return;
    setIsServerAiSaving(true);
    void updateServerAiConsent(next)
      .then(setServerAiEnabled)
      .catch(() => {
        Alert.alert('Could not save', 'Try again when you are back online.');
      })
      .finally(() => setIsServerAiSaving(false));
  };

  const runDisconnect = (source: IConnectedSource, mode: DisconnectMode): void => {
    void disconnectSource(source, mode)
      .catch((err: unknown) => {
        Alert.alert('Could not disconnect', disconnectFailureMessage(err));
      })
      .finally(() => void loadSources());
  };

  const handleDisconnect = (source: IConnectedSource): void => {
    const serverOption = serverDisconnectAllowed(source);
    const localOnly = {
      text: serverOption ? DISCONNECT_LOCAL_LABEL : 'Disconnect',
      style: 'destructive' as const,
      onPress: (): void => runDisconnect(source, 'local-only'),
    };
    Alert.alert(
      'Disconnect portal?',
      disconnectConfirmText(source, serverOption),
      serverOption
        ? [
            { text: 'Cancel', style: 'cancel' },
            localOnly,
            {
              text: DISCONNECT_SERVER_LABEL,
              style: 'destructive',
              onPress: (): void => runDisconnect(source, 'server-and-local'),
            },
          ]
        : [{ text: 'Cancel', style: 'cancel' }, localOnly]
    );
  };

  const handleSignOut = (): void => {
    if (isSigningOut) return;
    Alert.alert(
      'Sign out?',
      hideHousehold
        ? 'Removes your account from this device.'
        : 'Removes your account, saved portal credentials, and local sync history from this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: (): void => {
            setIsSigningOut(true);
            void logout()
              .catch(() => undefined)
              .finally(() => setIsSigningOut(false));
          },
        },
      ]
    );
  };

  const handleDeleteAccount = (): void => {
    setShowDeleteSheet(true);
  };

  const handleAccountDeleted = (): void => {
    setShowDeleteSheet(false);
    // The server removed the account; purge this phone (credentials, ledger, tokens) and leave.
    void logout().catch(() => undefined);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {hideHousehold ? null : (
          <>
            <Text style={styles.sectionHeader}>Connected Portals</Text>
            {sources.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>No portals connected on this device.</Text>
              </View>
            ) : (
              [...groupSourcesByPortalAccount(sources).entries()].map(([groupKey, grouped]) => (
                <View key={groupKey} style={styles.card}>
                  <Text style={styles.sourceName}>{grouped[0]?.provider ?? 'Portal'}</Text>
                  <Text style={styles.sourceSub}>{grouped[0]?.institutionExternalId}</Text>
                  {grouped.map((source) => (
                    <Text key={source.sourceId} style={styles.sourceSub}>
                      Student: {source.studentExternalId}
                    </Text>
                  ))}
                  {onSyncAll && grouped.length > 1 ? (
                    <TouchableOpacity
                      style={styles.syncAllBtn}
                      onPress={() => onSyncAll(grouped)}
                      testID={`button-sync-all-${portalAccountGroupKey(grouped[0]!)}`}
                    >
                      <Text style={styles.syncAllText}>Sync all ({grouped.length})</Text>
                    </TouchableOpacity>
                  ) : null}
                  {grouped.map((source) => (
                    <View key={source.sourceId} style={styles.sourceRow}>
                      <TouchableOpacity
                        style={styles.disconnectBtn}
                        onPress={() => handleDisconnect(source)}
                        testID={`button-disconnect-${source.sourceId}`}
                      >
                        <Text style={styles.disconnectText}>Disconnect</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ))
            )}
          </>
        )}

        {hideHousehold ? null : (
          <>
            <Text style={styles.sectionHeader}>Server-side analysis</Text>
            <View style={styles.card}>
              <Text style={styles.rowText}>{SERVER_AI_CONSENT_LABEL}</Text>
              <Text style={styles.hintText}>Off by default. You can change this anytime.</Text>
              <View style={styles.serverAiRow}>
                {isServerAiLoading ? (
                  <ActivityIndicator testID="loading-server-ai" />
                ) : (
                  <Switch
                    value={serverAiEnabled}
                    onValueChange={handleServerAiToggle}
                    disabled={isServerAiSaving}
                    testID="switch-server-ai"
                  />
                )}
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionHeader}>Notifications</Text>
        {onOpenNotificationSettings ? (
          <TouchableOpacity
            style={styles.card}
            onPress={onOpenNotificationSettings}
            accessibilityRole="button"
            accessibilityLabel={`Notification settings, device permission ${pushStatus}`}
            testID="link-notification-settings"
          >
            <Text style={styles.rowText}>
              Notification settings ›{' '}
              <Text style={styles.rowValue}>{pushStatus === 'granted' ? '' : pushStatus}</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.card}>
            <Text style={styles.rowText}>
              Permission: <Text style={styles.rowValue}>{pushStatus}</Text>
            </Text>
            {pushStatus !== 'granted' && (
              <Text style={styles.hintText}>
                Enable notifications in iOS Settings to receive grade alerts.
              </Text>
            )}
          </View>
        )}

        <Text style={styles.sectionHeader}>Legal</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => void Linking.openURL(STORE_LEGAL_URLS.privacy)}
          testID="link-privacy"
        >
          <Text style={styles.rowText}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.card}
          onPress={() => void Linking.openURL(STORE_LEGAL_URLS.terms)}
          testID="link-terms"
        >
          <Text style={styles.rowText}>Terms of Service</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.card}
          onPress={() => void Linking.openURL(STORE_LEGAL_URLS.support)}
          testID="link-support"
        >
          <Text style={styles.rowText}>Support</Text>
        </TouchableOpacity>

        {!hideHousehold && onOpenPlan ? (
          <TouchableOpacity style={styles.card} onPress={onOpenPlan} testID="link-plan-usage">
            <Text style={styles.rowText}>Plan & usage</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.sectionHeader}>Account</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={handleDeleteAccount}
          testID="link-delete-account"
        >
          <Text style={styles.deleteAccountText}>Delete account</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          disabled={isSigningOut}
          testID="button-sign-out"
        >
          <Text style={styles.signOutText}>{isSigningOut ? 'Signing out…' : 'Sign Out'}</Text>
        </TouchableOpacity>
      </ScrollView>
      <DeleteAccountSheet
        visible={showDeleteSheet}
        onClose={() => setShowDeleteSheet(false)}
        onDeleted={handleAccountDeleted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  back: { color: '#4361ee', fontSize: 17 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  headerSpacer: { width: 44 },
  content: { padding: 16, paddingBottom: 48 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  emptyText: { color: '#6c757d', fontSize: 14 },
  sourceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sourceInfo: { flex: 1 },
  sourceName: { fontSize: 15, fontWeight: '600', color: '#1a1a2e', textTransform: 'capitalize' },
  sourceSub: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  disconnectBtn: {
    borderWidth: 1,
    borderColor: '#dc3545',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  disconnectText: { color: '#dc3545', fontWeight: '600', fontSize: 13 },
  syncAllBtn: {
    marginTop: 10,
    marginBottom: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#4361ee',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  syncAllText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  rowText: { fontSize: 14, color: '#1a1a2e' },
  rowValue: { fontWeight: '600', textTransform: 'capitalize' },
  hintText: { fontSize: 13, color: '#6c757d', marginTop: 6 },
  serverAiRow: { marginTop: 12, alignItems: 'flex-start' },
  signOutBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dc3545',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#dc3545', fontWeight: '700', fontSize: 16 },
  deleteAccountText: { color: '#dc3545', fontWeight: '600', fontSize: 15 },
});
