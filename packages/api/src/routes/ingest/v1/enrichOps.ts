/**
 * Server-side join-gap enrichment for ingest envelopes.
 *
 * Same JoinGapEnricher + sanitizer as client `runClientScrape`. Fail-open:
 * throws, illegal patches, and revalidation failures fall back to original ops.
 *
 * Modes (ENRICH_OPS_MODE or IIngestV1RouterConfig.enrichOpsMode):
 *   off    — identity (default; production-safe)
 *   shadow — enrich and record patchCount, apply original ops
 *   apply  — enrich, revalidate, apply enriched ops (or original on failure)
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import {
  JoinGapEnricher,
  applyEnrichersFailOpen,
  type IAIEnricher,
} from '@scholaracle/scraper-core';

export type EnrichOpsMode = 'off' | 'shadow' | 'apply';

export interface IPrepareIngestOpsResult {
  readonly ops: readonly ISlcDeltaOp[];
  readonly mode: EnrichOpsMode;
  readonly patchCount: number;
  readonly failed: boolean;
  readonly applied: boolean;
}

export interface IPrepareIngestOpsParams {
  readonly ops: readonly ISlcDeltaOp[];
  readonly mode: EnrichOpsMode;
  /** Override for tests. Production uses JoinGapEnricher. */
  readonly enricher?: IAIEnricher;
  readonly revalidate?: (ops: readonly ISlcDeltaOp[]) => { valid: boolean; error?: string };
}

const defaultJoinGap = new JoinGapEnricher();

export function parseEnrichOpsMode(raw: string | undefined): EnrichOpsMode {
  if (raw === 'shadow' || raw === 'apply' || raw === 'off') return raw;
  return 'off';
}

export function resolveEnrichOpsMode(configMode?: EnrichOpsMode): EnrichOpsMode {
  if (configMode) return configMode;
  return parseEnrichOpsMode(process.env['ENRICH_OPS_MODE']);
}

export async function prepareIngestOps(
  params: IPrepareIngestOpsParams
): Promise<IPrepareIngestOpsResult> {
  const { mode } = params;
  if (mode === 'off') {
    return {
      ops: params.ops,
      mode,
      patchCount: 0,
      failed: false,
      applied: false,
    };
  }

  const original = params.ops as ISlcDeltaOp[];
  const enrichment = await applyEnrichersFailOpen({
    enrichers: [params.enricher ?? defaultJoinGap],
    rawExtract: {},
    ops: original,
  });

  if (mode === 'shadow') {
    return {
      ops: params.ops,
      mode,
      patchCount: enrichment.patchCount,
      failed: enrichment.failed,
      applied: false,
    };
  }

  if (enrichment.failed) {
    return {
      ops: params.ops,
      mode,
      patchCount: enrichment.patchCount,
      failed: true,
      applied: false,
    };
  }

  if (enrichment.patchCount === 0) {
    return {
      ops: enrichment.ops,
      mode,
      patchCount: 0,
      failed: false,
      applied: false,
    };
  }

  const check = params.revalidate?.(enrichment.ops) ?? { valid: true };
  if (!check.valid) {
    return {
      ops: params.ops,
      mode,
      patchCount: enrichment.patchCount,
      failed: true,
      applied: false,
    };
  }

  return {
    ops: enrichment.ops,
    mode,
    patchCount: enrichment.patchCount,
    failed: false,
    applied: true,
  };
}
