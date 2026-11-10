import type { Db } from 'mongodb';
import type { ISlcRunCoverage } from '@scholaracle/contracts';
import { RepairCandidateRepository } from '@scholaracle/database';
import {
  mapGapKindToRecipeStep,
  resolveCanonicalAdapterId,
  uniqueGapKindsFromCoverage,
} from '@scholaracle/scraper-core';
import { institutionExternalIdFromPortalUrl } from '../source-invite/normalizePortalUrl';

export async function recordRepairCandidatesFromCoverage(params: {
  readonly database: Db;
  readonly portalBaseUrl: string;
  readonly recipeId: string;
  readonly skeletonHash: string;
  readonly coverage: ISlcRunCoverage;
}): Promise<void> {
  let portalHost: string;
  try {
    portalHost = institutionExternalIdFromPortalUrl(params.portalBaseUrl);
  } catch {
    return;
  }
  const recipeId = resolveCanonicalAdapterId(params.recipeId);
  const gapKinds = uniqueGapKindsFromCoverage(params.coverage);
  const keys = [];
  for (const gapKind of gapKinds) {
    const step = mapGapKindToRecipeStep(recipeId, gapKind);
    if (!step) continue;
    keys.push({
      portalHost,
      recipeId,
      step,
      skeletonHash: params.skeletonHash,
      gapKind,
    });
  }
  const repo = new RepairCandidateRepository(params.database);
  await repo.recordSightings(keys);
}
