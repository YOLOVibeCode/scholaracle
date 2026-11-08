/**
 * Built-in portal adapter ids (decision D2): one canonical per provider.
 */

export type CanonicalBuiltinAdapterId = 'canvas' | 'skyward' | 'aeries';

export const CANONICAL_BUILTIN_ADAPTER_IDS: Readonly<Record<string, CanonicalBuiltinAdapterId>> = {
  canvas: 'canvas',
  skyward: 'skyward',
  aeries: 'aeries',
};

/** Alias key → canonical adapterId. Includes canonicals as identity entries. */
export const BUILTIN_ADAPTER_ID_ALIASES: Readonly<Record<string, CanonicalBuiltinAdapterId>> = {
  canvas: 'canvas',
  'com.instructure.canvas': 'canvas',
  'canvas-browser': 'canvas',
  skyward: 'skyward',
  'com.skyward.qmlativ': 'skyward',
  'com.skyward.iscorp': 'skyward',
  'com.skyward': 'skyward',
  'skyward-browser': 'skyward',
  aeries: 'aeries',
  'com.aeries.sis': 'aeries',
  'com.aeries.portal': 'aeries',
  'com.aeries': 'aeries',
  'aeries-browser': 'aeries',
};

/** @deprecated Use BUILTIN_ADAPTER_ID_ALIASES — kept for BuiltinScraperResolver lookup keys. */
export const BUILTIN_ALIAS_TO_ADAPTER: Readonly<Record<string, CanonicalBuiltinAdapterId>> =
  BUILTIN_ADAPTER_ID_ALIASES;

export const LEGACY_BUILTIN_ADAPTER_IDS: readonly string[] = Object.entries(
  BUILTIN_ADAPTER_ID_ALIASES
)
  .filter(([alias, canonical]) => alias !== canonical)
  .map(([alias]) => alias);

export function resolveCanonicalAdapterId(adapterId: string): string {
  const trimmed = adapterId.trim();
  if (!trimmed) return trimmed;
  return BUILTIN_ADAPTER_ID_ALIASES[trimmed] ?? trimmed;
}

export function isLegacyBuiltinAdapterId(adapterId: string): boolean {
  const canonical = BUILTIN_ADAPTER_ID_ALIASES[adapterId];
  return canonical !== undefined && adapterId !== canonical;
}
