/**
 * DeleteAccountSheet — in-app account deletion (App Store guideline 5.1.1(v)).
 *
 * The user proves who they are, then the server permanently removes the household. Accounts
 * created with a password confirm with it; accounts created with Apple have no known password,
 * so they confirm with a fresh Sign in with Apple. On success the phone is fully signed out
 * (portal credentials, ledger and tokens are purged).
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiClient } from '../api/client';
import { deleteFailureMessage } from './deleteAccountMessages';
import { isAppleProofAvailable, requestAppleProof } from '../auth/appleProof';
import { appleDeleteRequest, type IAppleDeleteRequest } from '../auth/appleDeleteRequest';

export interface IDeleteAccountSheetProps {
  readonly visible: boolean;
  onClose(): void;
  /** Called after the server confirmed deletion. Should sign the user out of the device. */
  onDeleted(): void;
}

export function DeleteAccountSheet({
  visible,
  onClose,
  onDeleted,
}: IDeleteAccountSheetProps): React.ReactElement {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPassword('');
    setError(null);
    void isAppleProofAvailable().then(setAppleAvailable);
  }, [visible]);

  const run = async (proof: { password: string } | IAppleDeleteRequest): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await apiClient.deleteAccount(proof);
      onDeleted();
    } catch (err: unknown) {
      setError(deleteFailureMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const confirmWithPassword = (): void => {
    if (busy || password.trim() === '') {
      setError('Enter your password, or confirm with Apple, to continue.');
      return;
    }
    void run({ password });
  };

  const confirmWithApple = async (): Promise<void> => {
    if (busy) return;
    try {
      const proof = await requestAppleProof();
      if (proof === null) return;
      await run(appleDeleteRequest(proof));
    } catch {
      setError('Apple confirmation failed. Nothing was deleted.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.sheet} testID="delete-account-sheet">
          <Text style={styles.title}>Delete your account?</Text>
          <Text style={styles.body}>
            This permanently removes your login, household, students, synced school records and push
            tokens from Scholarmancy. It cannot be undone. School portal passwords stay on this
            phone until you uninstall the app.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Account password"
            placeholderTextColor="#999"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            testID="input-delete-password"
          />
          <TouchableOpacity
            style={[styles.deleteButton, busy && styles.disabled]}
            onPress={confirmWithPassword}
            disabled={busy}
            accessibilityRole="button"
            testID="button-delete-with-password"
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.deleteText}>Delete my account</Text>
            )}
          </TouchableOpacity>

          {appleAvailable && (
            <TouchableOpacity
              style={[styles.appleButton, busy && styles.disabled]}
              onPress={() => void confirmWithApple()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Confirm deletion with Apple"
              testID="button-delete-with-apple"
            >
              <Text style={styles.appleText}>I signed up with Apple: confirm with Apple</Text>
            </TouchableOpacity>
          )}

          {error !== null && (
            <Text style={styles.error} testID="text-delete-error">
              {error}
            </Text>
          )}

          <TouchableOpacity
            onPress={onClose}
            disabled={busy}
            accessibilityRole="button"
            testID="button-delete-cancel"
          >
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 36,
  },
  title: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  body: { fontSize: 14, color: '#495057', lineHeight: 20, marginBottom: 16 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#212529',
    marginBottom: 12,
  },
  deleteButton: {
    height: 48,
    borderRadius: 10,
    backgroundColor: '#b02a37',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  appleButton: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#212529',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  appleText: { color: '#212529', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.6 },
  error: { color: '#b02a37', marginTop: 12, textAlign: 'center' },
  cancel: { color: '#4361ee', fontWeight: '600', textAlign: 'center', marginTop: 18, fontSize: 16 },
});
