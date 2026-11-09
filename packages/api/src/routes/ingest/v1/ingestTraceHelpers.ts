import type { ISlcIngestRunStats, ISlcIngestRunStep } from '@scholaracle/contracts';

export function parseIngestRunStep(raw: unknown): ISlcIngestRunStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = o['name'];
  const startedAt = o['startedAt'];
  const ms = o['ms'];
  const ok = o['ok'];
  if (typeof name !== 'string' || name.trim().length === 0) return null;
  if (typeof startedAt !== 'string' || startedAt.trim().length === 0) return null;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return null;
  if (typeof ok !== 'boolean') return null;
  const error = o['error'];
  return {
    name: name.trim(),
    startedAt,
    ms,
    ok,
    ...(typeof error === 'string' && error.length > 0 ? { error } : {}),
  };
}

export function parseIngestRunStats(raw: unknown): ISlcIngestRunStats | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
