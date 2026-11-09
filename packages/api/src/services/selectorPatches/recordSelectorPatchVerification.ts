import type { Db } from 'mongodb';
import type { ISlcRunCoverage, ISlcRepairCandidateKey } from '@scholaracle/contracts';
import { RepairCandidateRepository, ServedSelectorPatchRepository } from '@scholaracle/database';
import { mapGapKindToRecipeStep } from '@scholaracle/scraper-core';

function stepStillGapped(coverage: ISlcRunCoverage, recipeId: string, step: string): boolean {
  for (const stu of coverage.students) {
    for (const gap of stu.gaps) {
      if (mapGapKindToRecipeStep(recipeId, gap.kind) === step) return true;
    }
  }
  return false;
}

export async function recordSelectorPatchVerification(params: {
  readonly database: Db;
  readonly patchId: string;
  readonly key: ISlcRepairCandidateKey;
  readonly coverage?: ISlcRunCoverage;
}): Promise<void> {
  const servedRepo = new ServedSelectorPatchRepository(params.database);
  const row = await servedRepo.findByPatchId(params.patchId);
  if (!row || row.status !== 'served') return;

  const coverage = params.coverage;
  if (!coverage) {
    await servedRepo.markFailed(params.patchId, 'missing coverage on complete');
    await new RepairCandidateRepository(params.database).attachFailure(
      params.key,
      'missing coverage on complete'
    );
    return;
  }

  const stillBad = stepStillGapped(coverage, row.recipeId, row.step);
  if (stillBad) {
    await servedRepo.markFailed(params.patchId, 'sync completed but gap remains');
    await new RepairCandidateRepository(params.database).attachFailure(
      params.key,
      'sync completed but gap remains'
    );
    return;
  }

  await servedRepo.markVerified(params.patchId);
}
