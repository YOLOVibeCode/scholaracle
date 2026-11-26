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

  it('offers Sign in with Apple on iOS', () => {
    expect(nativeOAuthButtonFlags('ios')).toEqual({ apple: true });
  });

  it('offers no provider button on Android', () => {
    expect(nativeOAuthButtonFlags('android')).toEqual({ apple: false });
  });

  it('offers nothing but Apple even when Google or Microsoft client ids are set at build time', () => {
    process.env['EXPO_PUBLIC_GOOGLE_CLIENT_ID'] = 'g-client';
    process.env['EXPO_PUBLIC_MICROSOFT_CLIENT_ID'] = 'm-client';
    expect(nativeOAuthButtonFlags('ios')).toEqual({ apple: true });
    expect(nativeOAuthButtonFlags('android')).toEqual({ apple: false });
  });
});
