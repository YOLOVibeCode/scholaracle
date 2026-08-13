/**
 * SettingsScreen — account (sign out), connected portals management,
 * notification permission status, and app version.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../auth/AuthContext';
import { connectedSourceStore, type IConnectedSource } from '../sources/ConnectedSourceStore';
import { DeployStamp } from '../components/DeployStamp';

interface ISettingsScreenProps {
  onBack(): void;
}

export function SettingsScreen({ onBack }: ISettingsScreenProps): React.ReactElement {
  const { logout } = useAuth();
  const [sources, setSources] = useState<readonly IConnectedSource[]>([]);
  const [pushStatus, setPushStatus] = useState<string>('unknown');
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadSources = useCallback(async () => {
    setSources(await connectedSourceStore.list());
  }, []);

  useEffect(() => {
    void loadSources();
    Notifications.getPermissionsAsync()
      .then(({ status }) => setPushStatus(status))
      .catch(() => setPushStatus('unknown'));
  }, [loadSources]);

  const handleDisconnect = (source: IConnectedSource): void => {
    Alert.alert(
      'Disconnect portal?',
      `Removes ${source.provider} (${source.institutionExternalId}) and its saved credentials from this device. Already-synced data stays in your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: (): void => {
            void (async (): Promise<void> => {
              await SecureStore.deleteItemAsync(source.credentialKey).catch(() => undefined);
              await connectedSourceStore.remove(source.sourceId);
              await loadSources();
            })();
          },
        },
      ]
    );
  };

  const handleSignOut = (): void => {
    if (isSigningOut) return;
    Alert.alert(
      'Sign out?',
      'Removes your account, saved portal credentials, and local sync history from this device.',
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
        <Text style={styles.sectionHeader}>Connected Portals</Text>
        {sources.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No portals connected on this device.</Text>
          </View>
        ) : (
          sources.map((source) => (
            <View key={source.sourceId} style={styles.card}>
              <View style={styles.sourceRow}>
                <View style={styles.sourceInfo}>
                  <Text style={styles.sourceName}>{source.provider}</Text>
                  <Text style={styles.sourceSub}>{source.institutionExternalId}</Text>
                  <Text style={styles.sourceSub}>Student: {source.studentExternalId}</Text>
                </View>
                <TouchableOpacity
                  style={styles.disconnectBtn}
                  onPress={() => handleDisconnect(source)}
                  testID={`button-disconnect-${source.sourceId}`}
                >
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionHeader}>Notifications</Text>
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

        <Text style={styles.sectionHeader}>Account</Text>
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          disabled={isSigningOut}
          testID="button-sign-out"
        >
          <Text style={styles.signOutText}>{isSigningOut ? 'Signing out…' : 'Sign Out'}</Text>
        </TouchableOpacity>

        <DeployStamp />
      </ScrollView>
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
  rowText: { fontSize: 14, color: '#1a1a2e' },
  rowValue: { fontWeight: '600', textTransform: 'capitalize' },
  hintText: { fontSize: 13, color: '#6c757d', marginTop: 6 },
  signOutBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dc3545',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  signOutText: { color: '#dc3545', fontWeight: '700', fontSize: 16 },
});
