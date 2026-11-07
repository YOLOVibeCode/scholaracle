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

import React, { useCallback, useEffect, useState } from 'react';
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
import {
  ADAPTER_IDS,
  buildCredentialKey,
  connectedSourceStore,
  sourceIdForStudent,
} from '../sources/ConnectedSourceStore';
import { saveCredential } from '../credentials/saveCredential';
import { apiClient, type IStudentListItem } from '../api/client';
import { registerHouseholdBinding } from '../sources/registerHouseholdBinding';
import { extractHostname } from '../utils/urlNormalize';
import type { ISourceInvitePayload } from '@scholaracle/contracts';
import { connectSourceInitialState } from '../install/connectSourceInitialState';

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
  readonly invite?: ISourceInvitePayload;
  onConnected(): void;
  onCancel(): void;
}

export function ConnectSourceScreen({
  studentExternalId,
  studentId,
  invite,
  onConnected,
  onCancel,
}: IConnectSourceScreenProps): React.ReactElement {
  const initial = connectSourceInitialState(invite);
  const [step, setStep] = useState<'provider' | 'url' | 'child' | 'credentials'>(initial.step);
  const [householdStudents, setHouseholdStudents] = useState<readonly IStudentListItem[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<IStudentListItem | null>(null);
  const [resolvedStudentId, setResolvedStudentId] = useState<string | undefined>(
    invite?.studentId ?? studentId
  );
  const [resolvedExternalId, setResolvedExternalId] = useState<string | undefined>(
    invite?.studentExternalId ?? studentExternalId
  );
  const [selectedProvider, setSelectedProvider] = useState<IProviderInfo | null>(
    () => PROVIDERS.find((p) => p.id === initial.provider) ?? null
  );
  const [portalUrl, setPortalUrl] = useState(initial.portalUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSelectProvider = (provider: IProviderInfo): void => {
    setSelectedProvider(provider);
    setPortalUrl(provider.urlPlaceholder);
    setUrlError(null);
    setStep('url');
  };

  const needsChildStep = !resolvedStudentId;

  const loadStudents = useCallback(async (): Promise<void> => {
    try {
      const list = await apiClient.getStudents();
      setHouseholdStudents(list);
    } catch {
      setHouseholdStudents([]);
    }
  }, []);

  useEffect(() => {
    if (step === 'child') {
      void loadStudents();
    }
  }, [step, loadStudents]);

  const handleUrlNext = (): void => {
    const trimmed = portalUrl.trim();
    // Pure string parsing — RN's URL polyfill never throws and returns ''
    // hostnames for anything it can't parse.
    if (extractHostname(trimmed) === '') {
      setUrlError('Enter a full portal address like https://school.example.com');
      return;
    }
    setUrlError(null);
    setPortalUrl(trimmed);
    setStep(needsChildStep ? 'child' : 'credentials');
  };

  const handleSelectChild = (student: IStudentListItem): void => {
    setSelectedStudent(student);
    setResolvedStudentId(student.id);
    setResolvedExternalId(student.studentId ?? student.id);
    setStep('credentials');
  };

  const handleSaveCredentials = async (): Promise<void> => {
    if (!selectedProvider) return;
    if (!username.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter both username and password.');
      return;
    }

    const institutionExternalId = extractHostname(portalUrl);
    const mongoId = resolvedStudentId;
    const externalId = resolvedExternalId ?? mongoId;
    if (!externalId || !mongoId) {
      Alert.alert(
        'Add a student first',
        'Create a child profile before connecting a school portal.'
      );
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
      await saveCredential(key, JSON.stringify(credential));

      const sourceId = mongoId
        ? sourceIdForStudent(selectedProvider.id, institutionExternalId, mongoId)
        : `local-${selectedProvider.id}-${institutionExternalId}`;
      const adapterId = ADAPTER_IDS[selectedProvider.id] ?? `com.${selectedProvider.id}`;
      const connectedSource = {
        provider: selectedProvider.id,
        adapterId,
        baseUrl: portalUrl,
        sourceId,
        credentialKey: key,
        studentExternalId: externalId,
        institutionExternalId,
        studentId: mongoId,
        adapterVersion: '0.1.0',
      } as const;
      const displayName = `${selectedProvider.name} (${institutionExternalId})`;

      let portalAccountId: string | undefined;
      try {
        portalAccountId = await registerHouseholdBinding({
          source: connectedSource,
          displayName,
          registrar: apiClient,
        });
      } catch {
        // Offline — local connect still works; sync re-registers.
      }

      await connectedSourceStore.upsert({
        ...connectedSource,
        portalAccountId,
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
              testID={`button-provider-${p.id}`}
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
            onChangeText={(text): void => {
              setPortalUrl(text);
              setUrlError(null);
            }}
            autoCapitalize="none"
            keyboardType="url"
            returnKeyType="next"
            onSubmitEditing={handleUrlNext}
            testID="input-connect-url"
          />
          {urlError && (
            <Text style={styles.urlError} testID="url-error">
              {urlError}
            </Text>
          )}
          <TouchableOpacity
            style={styles.button}
            onPress={handleUrlNext}
            testID="button-connect-url-next"
          >
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.back} onPress={() => setStep('provider')}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'child' && (
        <View>
          <Text style={styles.stepTitle}>Which child?</Text>
          <Text style={styles.stepHint}>
            This portal login will sync data for the child you pick.
          </Text>
          {householdStudents.length === 0 ? (
            <Text style={styles.stepHint}>
              No students yet. Add a child from the student list first.
            </Text>
          ) : (
            householdStudents.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.providerCard}
                onPress={() => handleSelectChild(s)}
                testID={`connect-child-${s.id}`}
              >
                <Text style={styles.providerName}>{s.name}</Text>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity style={styles.back} onPress={() => setStep('url')}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {step === 'credentials' && selectedProvider && (
        <View>
          <Text style={styles.stepTitle}>Sign in to {selectedProvider.name}</Text>
          {selectedStudent ? (
            <Text style={styles.stepHint} testID="connect-selected-child">
              Child: {selectedStudent.name}
            </Text>
          ) : null}
          {initial.urlLocked ? <Text style={styles.stepHint}>{portalUrl}</Text> : null}
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
            testID="input-connect-username"
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
            testID="input-connect-password"
          />

          <TouchableOpacity
            style={[styles.button, isSaving && styles.buttonDisabled]}
            onPress={handleSaveCredentials}
            disabled={isSaving}
            testID="button-connect-save"
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Save &amp; Connect</Text>
            )}
          </TouchableOpacity>
          {initial.urlLocked ? null : (
            <TouchableOpacity style={styles.back} onPress={() => setStep('url')}>
              <Text style={styles.backText}>← Back</Text>
            </TouchableOpacity>
          )}
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
  urlError: { color: '#dc3545', fontSize: 13, marginTop: -8, marginBottom: 12 },
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
