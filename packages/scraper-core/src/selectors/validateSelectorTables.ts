import { AERIES_SELECTORS_V1, type IAeriesSelectorsV1 } from './aeriesV1';
import { SKYWARD_SELECTORS_V1, type ISkywardSelectorsV1 } from './skywardV1';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Structural validation (no JSON Schema runtime) — tables must match embedded v1 keys. */
export function assertAeriesSelectorTableV1(raw: unknown): asserts raw is {
  version: 1;
  selectors: IAeriesSelectorsV1;
} {
  if (!isRecord(raw)) throw new Error('Aeries selector table: expected object root');
  if (raw['version'] !== 1) throw new Error('Aeries selector table: version must be 1');
  if (!isRecord(raw['selectors'])) throw new Error('Aeries selector table: missing selectors');
  const expected = AERIES_SELECTORS_V1 as Record<string, string>;
  const sel = raw['selectors'] as Record<string, unknown>;
  for (const key of Object.keys(expected)) {
    const v = sel[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`Aeries selector table: missing or invalid "${key}"`);
    }
  }
  for (const key of Object.keys(sel)) {
    if (!(key in expected)) throw new Error(`Aeries selector table: unknown key "${key}"`);
  }
}

export function assertSkywardSelectorTableV1(raw: unknown): asserts raw is {
  version: 1;
  selectors: ISkywardSelectorsV1;
} {
  if (!isRecord(raw)) throw new Error('Skyward selector table: expected object root');
  if (raw['version'] !== 1) throw new Error('Skyward selector table: version must be 1');
  if (!isRecord(raw['selectors'])) throw new Error('Skyward selector table: missing selectors');
  const expected = SKYWARD_SELECTORS_V1 as Record<string, string>;
  const sel = raw['selectors'] as Record<string, unknown>;
  for (const key of Object.keys(expected)) {
    const v = sel[key];
    if (typeof v !== 'string' || v.length === 0) {
      throw new Error(`Skyward selector table: missing or invalid "${key}"`);
    }
  }
  for (const key of Object.keys(sel)) {
    if (!(key in expected)) throw new Error(`Skyward selector table: unknown key "${key}"`);
  }
}
