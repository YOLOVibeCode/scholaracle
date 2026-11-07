import type { IScraperRepairPatchResult, IScraperRepairTriageResult } from '@scholaracle/contracts';

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1]! : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('No JSON object in LLM response');
  }
  return JSON.parse(body.slice(start, end + 1)) as unknown;
}

export function parseTriageJson(raw: string): IScraperRepairTriageResult {
  const json = extractJsonObject(raw) as Record<string, unknown>;
  if (typeof json['real'] !== 'boolean' || typeof json['step'] !== 'string') {
    throw new Error('Invalid triage JSON');
  }
  return { real: json['real'], step: json['step'] };
}

export function parsePatchJson(raw: string): IScraperRepairPatchResult {
  const json = extractJsonObject(raw) as Record<string, unknown>;
  const selectors = json['selectors'];
  const confidence = json['confidence'];
  if (typeof json['step'] !== 'string' || typeof selectors !== 'object' || selectors === null) {
    throw new Error('Invalid patch JSON');
  }
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    throw new Error('Invalid patch confidence');
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(selectors as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
  }
  const notes = json['notes'];
  return {
    step: json['step'],
    selectors: out,
    confidence,
    ...(typeof notes === 'string' ? { notes } : {}),
  };
}
