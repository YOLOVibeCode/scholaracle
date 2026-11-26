/**
 * NativeOAuthButtons — Sign in with Apple on the native login screen.
 *
 * Apple is the only provider offered in the app (see nativeOAuthButtonFlags for why), so
 * this renders nothing on Android.
 */

import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useAuth } from './AuthContext';
import { nativeOAuthButtonFlags } from './nativeOAuthButtonFlags';

interface NativeOAuthButtonsProps {
  readonly onError?: (message: string) => void;
  readonly disabled?: boolean;
}

export function NativeOAuthButtons({
  onError,
  disabled = false,
}: NativeOAuthButtonsProps): React.ReactElement | null {
  const { loginWithApple, isAuthenticating } = useAuth();
  const [signingIn, setSigningIn] = useState(false);

  const busy = disabled || isAuthenticating || signingIn;

  const handleApple = useCallback(async () => {
    if (busy) return;
    setSigningIn(true);
    try {
      const rawNonce = Math.random().toString(36);
      const nonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      if (credential.identityToken === null || credential.identityToken === '') {
        onError?.('Apple did not return an identity token');
        return;
      }
      const email = credential.email ?? `${credential.user}@privaterelay.appleid.com`;
      const given = credential.fullName?.givenName ?? '';
      const family = credential.fullName?.familyName ?? '';
      const name = [given, family].filter(Boolean).join(' ') || email;
      await loginWithApple(credential.identityToken, rawNonce, name);
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
      setSigningIn(false);
    }
  }, [busy, loginWithApple, onError]);

  if (!nativeOAuthButtonFlags(Platform.OS).apple) {
    return null;
  }

  return (
    <View style={styles.container}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={12}
        style={styles.appleButton}
        onPress={handleApple}
      />
    </View>
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
});
