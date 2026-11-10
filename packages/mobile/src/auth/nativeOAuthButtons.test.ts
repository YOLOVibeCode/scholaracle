import { nativeOAuthButtonFlags } from './nativeOAuthButtonFlags';

describe('nativeOAuthButtonFlags', () => {
  const savedGoogle = process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'];
  const savedMicrosoft = process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID'];

  afterEach(() => {
    if (savedGoogle !== undefined) process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] = savedGoogle;
    else delete process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'];
    if (savedMicrosoft !== undefined) {
      process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID'] = savedMicrosoft;
    } else delete process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID'];
  });

  it('shows Apple on iOS even when Google/Microsoft env vars are unset', () => {
    delete process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'];
    delete process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID'];
    expect(nativeOAuthButtonFlags('ios')).toEqual({
      apple: true,
      google: false,
      microsoft: false,
      anyProvider: true,
    });
  });

  it('hides Apple on Android but can still show other providers', () => {
    process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] = 'g-client';
    delete process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID'];
    expect(nativeOAuthButtonFlags('android')).toEqual({
      apple: false,
      google: true,
      microsoft: false,
      anyProvider: true,
    });
  });
});
