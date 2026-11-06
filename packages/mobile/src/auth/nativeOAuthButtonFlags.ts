/**
 * OAuth button visibility for the native login screen (used by NativeOAuthButtons).
 */

export function nativeOAuthButtonFlags(os: string): {
  readonly apple: boolean;
  readonly google: boolean;
  readonly microsoft: boolean;
  readonly anyProvider: boolean;
} {
  const apple = os === 'ios';
  const google = Boolean(process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID']);
  const microsoft = Boolean(process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID']);
  return { apple, google, microsoft, anyProvider: apple || google || microsoft };
}
