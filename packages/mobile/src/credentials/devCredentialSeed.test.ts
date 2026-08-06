/**
 * Tests for companion credential safety (TDD).
 * Ensures we never treat EXPO_PUBLIC_* as a password channel,
 * and that seed is disabled outside __DEV__.
 */

// Mock the generated file so tests exercise process.env fallback (no live credentials in tests).
jest.mock('./companionDevSeed.generated', () => ({ COMPANION_DEV_SEED: null }));

import { readCompanionDevSeedFromEnv, buildCredentialKeyForTests } from './devCredentialSeed';

describe('devCredentialSeed', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;
  const env = process.env;

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    process.env = { ...env };
  });

  it('should build credential keys without embedding secrets', () => {
    expect(buildCredentialKeyForTests('canvas', 'https://school.instructure.com/')).toBe(
      'slc_creds_canvas_school.instructure.com'
    );
  });

  it('should return null when not in __DEV__', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    process.env['COMPANION_PORTAL_PROVIDER'] = 'canvas';
    process.env['COMPANION_PORTAL_BASE_URL'] = 'https://school.instructure.com';
    process.env['COMPANION_PORTAL_USERNAME'] = 'user';
    process.env['COMPANION_PORTAL_PASSWORD'] = 'secret';
    expect(readCompanionDevSeedFromEnv()).toBeNull();
  });

  it('should return null when password is missing', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    process.env['COMPANION_PORTAL_PROVIDER'] = 'canvas';
    process.env['COMPANION_PORTAL_BASE_URL'] = 'https://school.instructure.com';
    process.env['COMPANION_PORTAL_USERNAME'] = 'user';
    delete process.env['COMPANION_PORTAL_PASSWORD'];
    expect(readCompanionDevSeedFromEnv()).toBeNull();
  });

  it('should read a complete __DEV__ seed from COMPANION_* (not EXPO_PUBLIC_*)', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    process.env['COMPANION_PORTAL_PROVIDER'] = 'canvas';
    process.env['COMPANION_PORTAL_BASE_URL'] = 'https://school.instructure.com';
    process.env['COMPANION_PORTAL_USERNAME'] = 'user';
    process.env['COMPANION_PORTAL_PASSWORD'] = 'secret';
    // Poison: EXPO_PUBLIC password must be ignored by this loader
    process.env['EXPO_PUBLIC_PORTAL_PASSWORD'] = 'must-not-be-used';

    const seed = readCompanionDevSeedFromEnv();
    expect(seed).toEqual({
      provider: 'canvas',
      baseUrl: 'https://school.instructure.com',
      username: 'user',
      password: 'secret', // mock value — test fixture only
      studentExternalId: 'dev-student',
      sourceId: 'dev-source',
    });
    expect(seed?.password).not.toBe(process.env['EXPO_PUBLIC_PORTAL_PASSWORD']);
  });
});
