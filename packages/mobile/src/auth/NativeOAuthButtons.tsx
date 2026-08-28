/**
 * NativeOAuthButtons — Sign in with Apple (required by App Store), Google, and Microsoft.
 *
 * App Store rule: if Google or Microsoft sign-in is offered on iOS, Sign in with Apple
 * MUST also be offered. Apple is therefore always rendered first.
 *
 * The component is a no-op render on Android until Android-specific OAuth is wired up.
 */

import React, { useCallback, useState } from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { useAuth } from './AuthContext';

type OAuthProvider = 'apple' | 'google' | 'microsoft';

interface NativeOAuthButtonsProps {
  readonly onError?: (message: string) => void;
  readonly disabled?: boolean;
}

const GOOGLE_CLIENT_ID = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'];
const MICROSOFT_CLIENT_ID = process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID'];
const MICROSOFT_TENANT = process.env['EXPO_PUBLIC_MICROSOFT_TENANT'] ?? 'common';

export function NativeOAuthButtons({
  onError,
  disabled = false,
}: NativeOAuthButtonsProps): React.ReactElement | null {
  const { loginWithOAuth, isAuthenticating } = useAuth();
  const [signingIn, setSigningIn] = useState<OAuthProvider | null>(null);

  const busy = disabled || isAuthenticating || signingIn !== null;

  const handleApple = useCallback(async () => {
    if (busy) return;
    setSigningIn('apple');
    try {
      const nonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Math.random().toString(36)
      );
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      const email = credential.email ?? `${credential.user}@privaterelay.appleid.com`;
      const given = credential.fullName?.givenName ?? '';
      const family = credential.fullName?.familyName ?? '';
      const name = [given, family].filter(Boolean).join(' ') || email;
      await loginWithOAuth('apple', credential.user, email, name);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }
      onError?.(err instanceof Error ? err.message : 'Apple sign-in failed');
    } finally {
      setSigningIn(null);
    }
  }, [busy, loginWithOAuth, onError]);

  const handleGoogle = useCallback(async () => {
    if (busy || !GOOGLE_CLIENT_ID) return;
    setSigningIn('google');
    try {
      const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');
      const redirectUri = AuthSession.makeRedirectUri();
      const request = new AuthSession.AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['openid', 'profile', 'email'],
        redirectUri,
      });
      const result = await request.promptAsync(discovery);
      if (result.type !== 'success') return;
      const tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId: GOOGLE_CLIENT_ID,
          code: result.params['code'] ?? '',
          redirectUri,
          extraParams: { code_verifier: request.codeVerifier ?? '' },
        },
        discovery
      );
      const userInfo = (await (
        await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        })
      ).json()) as { sub?: string; email?: string; name?: string };
      await loginWithOAuth(
        'google',
        userInfo.sub ?? '',
        userInfo.email ?? '',
        userInfo.name ?? userInfo.email ?? ''
      );
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setSigningIn(null);
    }
  }, [busy, loginWithOAuth, onError]);

  const handleMicrosoft = useCallback(async () => {
    if (busy || !MICROSOFT_CLIENT_ID) return;
    setSigningIn('microsoft');
    try {
      const discovery = await AuthSession.fetchDiscoveryAsync(
        `https://login.microsoftonline.com/${MICROSOFT_TENANT}/v2.0`
      );
      const redirectUri = AuthSession.makeRedirectUri();
      const request = new AuthSession.AuthRequest({
        clientId: MICROSOFT_CLIENT_ID,
        scopes: ['openid', 'profile', 'email', 'User.Read'],
        redirectUri,
      });
      const result = await request.promptAsync(discovery);
      if (result.type !== 'success') return;
      const tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId: MICROSOFT_CLIENT_ID,
          code: result.params['code'] ?? '',
          redirectUri,
          extraParams: { code_verifier: request.codeVerifier ?? '' },
        },
        discovery
      );
      const userInfo = (await (
        await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
        })
      ).json()) as { id?: string; mail?: string; displayName?: string };
      await loginWithOAuth(
        'microsoft',
        userInfo.id ?? '',
        userInfo.mail ?? '',
        userInfo.displayName ?? userInfo.mail ?? ''
      );
    } catch (err: unknown) {
      onError?.(err instanceof Error ? err.message : 'Microsoft sign-in failed');
    } finally {
      setSigningIn(null);
    }
  }, [busy, loginWithOAuth, onError]);

  const appleAvailable = Platform.OS === 'ios';
  const googleAvailable = Boolean(GOOGLE_CLIENT_ID);
  const microsoftAvailable = Boolean(MICROSOFT_CLIENT_ID);

  if (!appleAvailable && !googleAvailable && !microsoftAvailable) {
    return null;
  }

  return (
    <View style={styles.container}>
      {appleAvailable && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.appleButton}
          onPress={handleApple}
        />
      )}

      {googleAvailable && (
        <OAuthButton
          label="Continue with Google"
          onPress={handleGoogle}
          loading={signingIn === 'google'}
          disabled={busy}
          testID="button-oauth-google"
        />
      )}

      {microsoftAvailable && (
        <OAuthButton
          label="Continue with Microsoft"
          onPress={handleMicrosoft}
          loading={signingIn === 'microsoft'}
          disabled={busy}
          testID="button-oauth-microsoft"
        />
      )}
    </View>
  );
}

function OAuthButton({
  label,
  onPress,
  loading,
  disabled,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly testID?: string;
}): React.ReactElement {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.buttonDisabled]}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color="#333" />
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 8,
  },
  appleButton: {
    height: 52,
    width: '100%',
  },
  button: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dee2e6',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
});
