/**
 * Built-in portal adapterId aliases (decision D2).
 */

import {
  BUILTIN_ADAPTER_ID_ALIASES,
  CANONICAL_BUILTIN_ADAPTER_IDS,
  isLegacyBuiltinAdapterId,
  LEGACY_BUILTIN_ADAPTER_IDS,
  resolveCanonicalAdapterId,
} from './adapter-aliases';

describe('CANONICAL_BUILTIN_ADAPTER_IDS', () => {
  it('freezes canvas, skyward, and aeries', () => {
    expect(CANONICAL_BUILTIN_ADAPTER_IDS).toEqual({
      canvas: 'canvas',
      skyward: 'skyward',
      aeries: 'aeries',
    });
  });
});

describe('resolveCanonicalAdapterId', () => {
  it.each([
    ['canvas', 'canvas'],
    ['com.instructure.canvas', 'canvas'],
    ['canvas-browser', 'canvas'],
    ['skyward', 'skyward'],
    ['com.skyward.qmlativ', 'skyward'],
    ['com.skyward.iscorp', 'skyward'],
    ['com.skyward', 'skyward'],
    ['skyward-browser', 'skyward'],
    ['aeries', 'aeries'],
    ['com.aeries.sis', 'aeries'],
    ['com.aeries.portal', 'aeries'],
    ['com.aeries', 'aeries'],
    ['aeries-browser', 'aeries'],
  ] as const)('maps %s → %s', (alias, canonical) => {
    expect(resolveCanonicalAdapterId(alias)).toBe(canonical);
  });

  it('passes through unknown adapter ids', () => {
    expect(resolveCanonicalAdapterId('com.hobbyist.skyward-x')).toBe('com.hobbyist.skyward-x');
    expect(resolveCanonicalAdapterId('com.example.custom')).toBe('com.example.custom');
  });
});

describe('isLegacyBuiltinAdapterId', () => {
  it('is false for canonical ids', () => {
    expect(isLegacyBuiltinAdapterId('canvas')).toBe(false);
    expect(isLegacyBuiltinAdapterId('skyward')).toBe(false);
    expect(isLegacyBuiltinAdapterId('aeries')).toBe(false);
  });

  it('is true for known legacy builtins', () => {
    for (const legacy of LEGACY_BUILTIN_ADAPTER_IDS) {
      expect(isLegacyBuiltinAdapterId(legacy)).toBe(true);
    }
  });
});

describe('BUILTIN_ADAPTER_ID_ALIASES', () => {
  it('maps every legacy id to a canonical', () => {
    for (const [alias, canonical] of Object.entries(BUILTIN_ADAPTER_ID_ALIASES)) {
      if (alias === canonical) continue;
      expect(['canvas', 'skyward', 'aeries']).toContain(canonical);
    }
  });
});
