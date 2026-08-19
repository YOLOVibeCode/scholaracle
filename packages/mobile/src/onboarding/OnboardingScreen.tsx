/**
 * First-run wizard: account → children → school system → portal URL →
 * school password (Keychain only). Completing creates the household on
 * the server and local connected sources.
 */

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { apiClient } from '../api/client';
import { saveLogin } from '../credentials/savedLoginStore';
import { connectedSourceStore } from '../sources/ConnectedSourceStore';
import { applyOnboarding, type IApplyOnboardingResult } from './applyOnboarding';
import {
  addChild,
  canAdvance,
  createInitialOnboardingState,
  reduceOnboarding,
  removeChild,
  updateChild,
  type OnboardingEntry,
  type OnboardingProvider,
} from './onboardingMachine';
import { registerForPushNotifications } from '../notifications/pushSetup';

const PROVIDERS: readonly { id: OnboardingProvider; name: string; urlHint: string }[] = [
  { id: 'skyward', name: 'Skyward Family Access', urlHint: 'https://skyward.iscorp.com' },
  { id: 'canvas', name: 'Canvas LMS', urlHint: 'https://yourschool.instructure.com' },
  { id: 'aeries', name: 'Aeries Parent Portal', urlHint: 'https://yourschool.aeries.net' },
];

export interface IOnboardingScreenProps {
  readonly entry: OnboardingEntry;
  onComplete(result: IApplyOnboardingResult): void;
}

export function OnboardingScreen({
  entry,
  onComplete,
}: IOnboardingScreenProps): React.ReactElement {
  const { login, register, isAuthenticating, error } = useAuth();
  const [state, setState] = useState(() => createInitialOnboardingState(entry));
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [alertsDone, setAlertsDone] = useState(false);
  const [applyResult, setApplyResult] = useState<IApplyOnboardingResult | null>(null);

  const ready = useMemo(() => canAdvance(state), [state]);

  const submitAccount = async (): Promise<void> => {
    const email = state.email.trim();
    if (state.accountMode === 'create') {
      await register(email, state.password, state.parentName.trim());
    } else {
      await login(email, state.password);
    }
    await saveLogin({ email, password: state.password }).catch(() => undefined);
  };

  const handleNext = async (): Promise<void> => {
    setLocalError(null);
    if (state.step === 'account') {
      if (!ready || isAuthenticating) return;
      setBusy(true);
      try {
        await submitAccount();
        // App remounts at children once isLoggedIn; do not advance locally.
      } catch {
        // AuthContext owns the message.
      } finally {
        setBusy(false);
      }
      return;
    }
    if (state.step !== 'credentials') {
      if (!ready) return;
      setState((s) => reduceOnboarding(s, { type: 'next' }));
      return;
    }
    if (!ready || busy) return;
    setBusy(true);
    try {
      const result = await applyOnboarding(state, {
        createStudent: (req) => apiClient.createStudent(req),
        registerIngestSource: (src) => apiClient.registerIngestSource(src),
        sources: connectedSourceStore,
      });
      setApplyResult(result);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : 'Could not finish setup');
    } finally {
      setBusy(false);
    }
  };

  const finishAlerts = (enable: boolean): void => {
    if (enable) {
      void registerForPushNotifications();
    }
    if (applyResult) onComplete(applyResult);
  };

  if (applyResult && !alertsDone) {
    return (
      <View style={styles.body}>
        <Text style={styles.stepTitle}>Stay in the loop</Text>
        <Text style={styles.help}>
          After the first sync, Scholarmancy can notify you about missing work and grade drops. You
          can change this later in Settings.
        </Text>
        {applyResult.planLimitReached && (
          <Text style={styles.warn}>
            Your plan allows one student on this account.{' '}
            {applyResult.students[0]?.name ?? 'The first child'} is set up — upgrade later to add
            another.
          </Text>
        )}
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            setAlertsDone(true);
            finishAlerts(true);
          }}
          testID="button-enable-alerts"
        >
          <Text style={styles.buttonText}>Enable alerts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => {
            setAlertsDone(true);
            finishAlerts(false);
          }}
          testID="button-skip-alerts"
        >
          <Text style={styles.secondaryButtonText}>Not now</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {state.step !== 'account' && (
          <TouchableOpacity onPress={() => setState((s) => reduceOnboarding(s, { type: 'back' }))}>
            <Text style={styles.back}>Back</Text>
          </TouchableOpacity>
        )}

        {state.step === 'account' && (
          <>
            <Text style={styles.title}>Scholarmancy</Text>
            <Text style={styles.subtitle}>
              {state.accountMode === 'create'
                ? 'Create your parent account'
                : 'Sign in to your account'}
            </Text>
            {state.accountMode === 'create' && (
              <TextInput
                style={styles.input}
                placeholder="Your name"
                placeholderTextColor="#999"
                value={state.parentName}
                onChangeText={(value) =>
                  setState((s) => reduceOnboarding(s, { type: 'set-parent-name', value }))
                }
                testID="input-parent-name"
              />
            )}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              autoCapitalize="none"
              keyboardType="email-address"
              value={state.email}
              onChangeText={(value) =>
                setState((s) => reduceOnboarding(s, { type: 'set-email', value }))
              }
              testID="input-email"
            />
            <TextInput
              style={styles.input}
              placeholder={state.accountMode === 'create' ? 'Password (8+ characters)' : 'Password'}
              placeholderTextColor="#999"
              secureTextEntry
              value={state.password}
              onChangeText={(value) =>
                setState((s) => reduceOnboarding(s, { type: 'set-password', value }))
              }
              testID="input-password"
            />
            <TouchableOpacity
              onPress={() =>
                setState((s) =>
                  reduceOnboarding(s, {
                    type: 'set-account-mode',
                    mode: s.accountMode === 'create' ? 'signin' : 'create',
                  })
                )
              }
            >
              <Text style={styles.link}>
                {state.accountMode === 'create'
                  ? 'I already have an account'
                  : 'Create a new account'}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {state.step === 'children' && (
          <>
            <Text style={styles.stepTitle}>Who are we tracking?</Text>
            <Text style={styles.help}>
              Add each child. You can share one school login for both.
            </Text>
            {state.children.map((child, index) => (
              <View key={child.key} style={styles.childRow}>
                <TextInput
                  style={[styles.input, styles.childName]}
                  placeholder={index === 0 ? 'First name (e.g. Gideon)' : 'First name'}
                  placeholderTextColor="#999"
                  value={child.name}
                  onChangeText={(name) => setState((s) => updateChild(s, child.key, { name }))}
                  testID={`input-child-name-${index}`}
                />
                <TextInput
                  style={[styles.input, styles.childGrade]}
                  placeholder="Grade"
                  placeholderTextColor="#999"
                  keyboardType="number-pad"
                  value={child.grade}
                  onChangeText={(grade) => setState((s) => updateChild(s, child.key, { grade }))}
                />
                {state.children.length > 1 && (
                  <TouchableOpacity onPress={() => setState((s) => removeChild(s, child.key))}>
                    <Text style={styles.remove}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity
              onPress={() => setState((s) => addChild(s))}
              testID="button-add-child"
            >
              <Text style={styles.link}>Add another child</Text>
            </TouchableOpacity>
          </>
        )}

        {state.step === 'provider' && (
          <>
            <Text style={styles.stepTitle}>School system</Text>
            {PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.card, state.provider === p.id && styles.cardSelected]}
                onPress={() =>
                  setState((s) =>
                    reduceOnboarding(
                      reduceOnboarding(s, { type: 'set-provider', provider: p.id }),
                      { type: 'set-portal-url', value: p.urlHint }
                    )
                  )
                }
                testID={`button-provider-${p.id}`}
              >
                <Text style={styles.cardTitle}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {state.step === 'portal-url' && (
          <>
            <Text style={styles.stepTitle}>Portal address</Text>
            <Text style={styles.help}>The site you open to check grades in a browser.</Text>
            <TextInput
              style={styles.input}
              placeholder="https://…"
              placeholderTextColor="#999"
              autoCapitalize="none"
              autoCorrect={false}
              value={state.portalUrl}
              onChangeText={(value) =>
                setState((s) => reduceOnboarding(s, { type: 'set-portal-url', value }))
              }
              testID="input-portal-url"
            />
          </>
        )}

        {state.step === 'credentials' && (
          <>
            <Text style={styles.stepTitle}>School sign-in</Text>
            <Text style={styles.help}>
              Stored only on this phone. Scholarmancy never sends your school password to our
              servers.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#999"
              autoCapitalize="none"
              value={state.username}
              onChangeText={(value) =>
                setState((s) => reduceOnboarding(s, { type: 'set-username', value }))
              }
              testID="input-portal-username"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#999"
              secureTextEntry
              value={state.portalPassword}
              onChangeText={(value) =>
                setState((s) => reduceOnboarding(s, { type: 'set-portal-password', value }))
              }
              testID="input-portal-password"
            />
          </>
        )}

        {(error || localError) && (
          <Text style={styles.error} testID="text-onboarding-error">
            {localError ?? error}
          </Text>
        )}

        <TouchableOpacity
          style={[styles.button, (!ready || busy || isAuthenticating) && styles.buttonDisabled]}
          onPress={() => void handleNext()}
          disabled={!ready || busy || isAuthenticating}
          testID="button-onboarding-next"
        >
          {busy || isAuthenticating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              {state.step === 'credentials' ? 'Save and continue' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  body: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1a1a2e',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6c757d',
    marginBottom: 24,
    textAlign: 'center',
  },
  stepTitle: { fontSize: 22, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  help: { fontSize: 15, color: '#6c757d', marginBottom: 20, lineHeight: 22 },
  back: { color: '#4361ee', fontWeight: '600', marginBottom: 16 },
  input: {
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
    color: '#212529',
  },
  childRow: { marginBottom: 8 },
  childName: { marginBottom: 8 },
  childGrade: { width: 120 },
  remove: { color: '#dc3545', fontWeight: '600', marginBottom: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    padding: 16,
    marginBottom: 12,
  },
  cardSelected: { borderColor: '#4361ee', borderWidth: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  link: { color: '#4361ee', fontWeight: '600', marginBottom: 20, textAlign: 'center' },
  error: { color: '#dc3545', marginBottom: 12, textAlign: 'center' },
  warn: { color: '#b45309', marginBottom: 16, lineHeight: 22 },
  button: {
    backgroundColor: '#4361ee',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  secondaryButtonText: { color: '#4361ee', fontWeight: '600', fontSize: 16 },
});
