/**
 * LoginScreen — email + password form, wires to AuthContext.
 * Prefills saved credentials, offers a show/hide password toggle.
 */

import React, { useEffect, useState } from 'react';
import {
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { loadSavedLogin, saveLogin } from '../credentials/savedLoginStore';

export function LoginScreen(): React.ReactElement {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadSavedLogin().then((saved) => {
      if (saved) {
        setEmail(saved.email);
        setPassword(saved.password);
      }
    });
  }, []);

  const handleLogin = async (): Promise<void> => {
    setError(null);
    try {
      await login(email.trim(), password);
      await saveLogin({ email: email.trim(), password });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Image
        source={require('../../assets/icon.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityLabel="Scholarmancy logo"
      />
      <Text style={styles.title}>Scholarmancy</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>

      {error && <Text style={styles.error}>{error}</Text>}

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
        onChangeText={setEmail}
      />
      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          placeholder="Password"
          placeholderTextColor="#999"
          secureTextEntry={!showPassword}
          textContentType="password"
          returnKeyType="done"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={handleLogin}
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
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign In</Text>
        )}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
    marginBottom: 16,
    textAlign: 'center',
  },
});
