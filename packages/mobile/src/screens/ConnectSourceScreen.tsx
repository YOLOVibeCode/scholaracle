/**
 * ConnectSourceScreen
 *
 * Guides the user through connecting a school portal:
 *   1. Select provider (Canvas, Skyward, Aeries)
 *   2. Enter portal URL
 *   3. Enter credentials — stored in Keychain ONLY, never sent to server
 *
 * The connector token is minted from the server and stored separately in SecureStore.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  connectedSourceStore,
  buildCredentialKey,
  ADAPTER_IDS,
} from '../sources/ConnectedSourceStore';

type Provider = 'canvas' | 'skyward' | 'aeries';

interface IProviderInfo {
  readonly id: Provider;
  readonly name: string;
  readonly urlPlaceholder: string;
  readonly loginMethod: 'direct' | 'google_sso';
}

const PROVIDERS: IProviderInfo[] = [
  {
    id: 'canvas',
    name: 'Canvas LMS',
    urlPlaceholder: 'https://yourschool.instructure.com',
    loginMethod: 'direct',
  },
  {
    id: 'skyward',
    name: 'Skyward Family Access',
    urlPlaceholder: 'https://yourdistrict.skyward.com',
    loginMethod: 'direct',
  },
  {
    id: 'aeries',
    name: 'Aeries Parent Portal',
    urlPlaceholder: 'https://yourschool.aeries.net',
    loginMethod: 'direct',
  },
];

interface ISavedCredential {
  readonly username: string;
  readonly password: string;
  readonly baseUrl: string;
  readonly provider: Provider;
  readonly loginMethod: string;
}

interface IConnectSourceScreenProps {
  readonly studentExternalId?: string;
  readonly studentId?: string;
  onConnected(): void;
  onCancel(): void;
}

export function ConnectSourceScreen({
  studentExternalId,
  studentId,
  onConnected,
  onCancel,
}: IConnectSourceScreenProps): React.ReactElement {
  const [step, setStep] = useState<'provider' | 'url' | 'credentials'>('provider');
  const [selectedProvider, setSelectedProvider] = useState<IProviderInfo | null>(null);
  const [portalUrl, setPortalUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectProvider = (provider: IProviderInfo): void => {
    setSelectedProvider(provider);
    setPortalUrl(provider.urlPlaceholder);
    setStep('url');
  };

  const handleUrlNext = (): void => {
    const trimmed = portalUrl.trim();
    if (!trimmed.startsWith('http')) {
      Alert.alert('Invalid URL', 'Please enter a full URL starting with https://');
      return;
    }
    setPortalUrl(trimmed);
    setStep('credentials');
  };

  const handleSaveCredentials = async (): Promise<void> => {
    if (!selectedProvider) return;
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both username and password.');
      return;
    }

    setIsSaving(true);
    try {
      const credential: ISavedCredential = {
        username: username.trim(),
        password,
        baseUrl: portalUrl,
        provider: selectedProvider.id,
        loginMethod: selectedProvider.loginMethod,
      };

      // Store credentials in Keychain — never sent to server
      const key = buildCredentialKey(selectedProvider.id, portalUrl);
      await SecureStore.setItemAsync(key, JSON.stringify(credential), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED,
      });

      const institutionExternalId = new URL(portalUrl).hostname;
      const sourceId = `local-${selectedProvider.id}-${institutionExternalId}`;
      await connectedSourceStore.upsert({
        provider: selectedProvider.id,
        adapterId: ADAPTER_IDS[selectedProvider.id] ?? `com.${selectedProvider.id}`,
        baseUrl: portalUrl,
        sourceId,
        credentialKey: key,
        studentExternalId: studentExternalId ?? 'default',
        institutionExternalId,
        studentId,
        adapterVersion: '0.1.0',
      });

      Alert.alert(
        'Connected!',
        `${selectedProvider.name} credentials saved securely on your device. Tap Sync to fetch your data.`,
        [{ text: 'OK', onPress: onConnected }]
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      Alert.alert('Error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Connect Portal</Text>
        <View style={{ width: 60 }} />
      </View>

      {step === 'provider' && (
        <View>
          <Text style={styles.stepTitle}>Select your school system</Text>
          {PROVIDERS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.providerCard}
              onPress={() => handleSelectProvider(p)}
            >
              <Text style={styles.providerName}>{p.name}</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {step === 'url' && selectedProvider && (
        <View>
          <Text style={styles.stepTitle}>Enter your {selectedProvider.name} URL</Text>
          <Text style={styles.stepHint}>This is the web address you use to log in at school.</Text>
          <TextInput
            style={styles.input}
            value={portalUrl}
            onChangeText={setPortalUrl}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="next"
            onSubmitEditing={handleUrlNext}
          />
          <TouchableOpacity style={styles.button} onPress={handleUrlNext}>
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.back} onPress={() => setStep('provider')}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'credentials' && selectedProvider && (
        <View>
          <Text style={styles.stepTitle}>Sign in to {selectedProvider.name}</Text>
          <View style={styles.securityBadge}>
            <Text style={styles.securityText}>
              🔒 Your credentials are stored only on this device — never sent to our servers.
            </Text>
          </View>

          <Text style={styles.label}>Username / Email</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
            placeholder="your.email@school.edu"
            placeholderTextColor="#999"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={handleSaveCredentials}
            placeholder="••••••••"
            placeholderTextColor="#999"
          />

          <TouchableOpacity
            style={[styles.button, isSaving && styles.buttonDisabled]}
            onPress={handleSaveCredentials}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save &amp; Connect</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.back} onPress={() => setStep('url')}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingTop: 8,
  },
  cancelText: { color: '#4361ee', fontSize: 16 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  stepTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  stepHint: { fontSize: 14, color: '#6c757d', marginBottom: 20 },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  providerName: { flex: 1, fontSize: 17, fontWeight: '600', color: '#1a1a2e' },
  chevron: { color: '#adb5bd', fontSize: 22 },
  label: { fontSize: 14, fontWeight: '600', color: '#495057', marginBottom: 8 },
  input: {
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 16,
    color: '#212529',
  },
  securityBadge: {
    backgroundColor: '#d4edda',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  securityText: { color: '#155724', fontSize: 13 },
  button: {
    height: 52,
    backgroundColor: '#4361ee',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  back: { alignItems: 'center', paddingVertical: 8 },
  backText: { color: '#4361ee', fontSize: 15 },
});
