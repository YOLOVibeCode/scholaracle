/**
 * LoginScreen — email + password form, wires to AuthContext.
 *
 * Hard-won invariants (each reverses a shipped bug):
 * - The screen must stay MOUNTED during login (spinner renders in-button);
 *   auth errors come from context (single channel) and render below the
 *   button, where the keyboard cannot clip them.
 * - Saved-credential prefill only fills fields that are empty AND untouched;
 *   it must never overwrite what the user is typing.
 * - A 401 invalidates the saved password — otherwise the form silently
 *   resubmits a dead credential forever.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import {
  loadSavedLogin,
  saveLogin,
  clearSavedPassword,
  resolvePrefill,
} from '../credentials/savedLoginStore';
import { ApiError } from '../api/ApiError';

export interface ILoginScreenProps {
  /** Parent first-run only. Students are parent-provisioned and stay on this form. */
  onCreateAccount?(): void;
}

export function LoginScreen({ onCreateAccount }: ILoginScreenProps = {}): React.ReactElement {
  const { login, isAuthenticating, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const userEdited = useRef({ email: false, password: false });
  const currentValues = useRef({ email: '', password: '' });
  const isSubmitting = useRef(false);

  useEffect(() => {
    loadSavedLogin()
      .then((saved) => {
        const fill = resolvePrefill(saved, currentValues.current, userEdited.current);
        if (fill.email !== undefined) {
          currentValues.current.email = fill.email;
          setEmail(fill.email);
        }
        if (fill.password !== undefined) {
          currentValues.current.password = fill.password;
          setPassword(fill.password);
        }
      })
      .catch(() => {
        // Keychain unavailable — start with an empty form.
      });
  }, []);

  const handleEmailChange = (value: string): void => {
    userEdited.current.email = true;
    currentValues.current.email = value;
    setEmail(value);
  };

  const handlePasswordChange = (value: string): void => {
    userEdited.current.password = true;
    currentValues.current.password = value;
    setPassword(value);
  };

  const handleLogin = async (): Promise<void> => {
    if (isSubmitting.current || isAuthenticating) return;
    isSubmitting.current = true;
    const trimmedEmail = email.trim();
    try {
      await login(trimmedEmail, password);
      await saveLogin({ email: trimmedEmail, password }).catch(() => undefined);
    } catch (err: unknown) {
      // Context owns the error display. A 401 means the stored password is
      // dead — invalidate it so the next mount doesn't resubmit it.
      if (err instanceof ApiError && err.status === 401) {
        void clearSavedPassword(trimmedEmail);
      }
    } finally {
      isSubmitting.current = false;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.body}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Scholarmancy logo"
        />
        <Text style={styles.title}>Scholarmancy</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#999"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          value={email}
          onChangeText={handleEmailChange}
          testID="input-email"
        />
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Password"
            placeholderTextColor="#999"
            secureTextEntry={!showPassword}
            textContentType="password"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="current-password"
            returnKeyType="done"
            value={password}
            onChangeText={handlePasswordChange}
            onSubmitEditing={handleLogin}
            testID="input-password"
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Text style={styles.eyeIcon}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, isAuthenticating && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isAuthenticating}
          testID="button-login"
        >
          {isAuthenticating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>

        {error && (
          <Text style={styles.error} testID="text-login-error">
            {error}
          </Text>
        )}

        {onCreateAccount !== undefined ? (
          <TouchableOpacity onPress={onCreateAccount} testID="link-create-parent-account">
            <Text style={styles.createLink}>Create a parent account</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    width: 96,
    height: 96,
    alignSelf: 'center',
    marginBottom: 16,
    borderRadius: 22,
  },
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
    marginBottom: 32,
    textAlign: 'center',
  },
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
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#212529',
  },
  eyeButton: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
  },
  eyeIcon: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4361ee',
  },
  button: {
    height: 52,
    backgroundColor: '#4361ee',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  error: {
    color: '#dc3545',
    marginTop: 16,
    textAlign: 'center',
  },
  createLink: {
    color: '#4361ee',
    fontWeight: '600',
    marginTop: 24,
    textAlign: 'center',
    fontSize: 16,
  },
});
