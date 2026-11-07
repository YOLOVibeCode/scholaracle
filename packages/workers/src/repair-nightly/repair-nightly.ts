import type { Db } from 'mongodb';
import { runScraperRepairProposal, resolveLlmConfig } from '@scholaracle/agents';
import { RepairCandidateRepository, RepairProposalRepository } from '@scholaracle/database';
import { selectorTableJsonForRecipe } from './selectorTableJson';
import { logger } from '../logger';

const DEFAULT_BATCH = 25;
const MAX_PROPOSALS_PER_WEEK = 3;

export interface IRepairNightlyDeps {
  readonly loadSkeleton: (key: { step: string; skeletonHash: string }) => Promise<string | null>;
  readonly billingUserId: string;
}

export async function runRepairNightly(database: Db, deps: IRepairNightlyDeps): Promise<number> {
  if (!resolveLlmConfig('triage')) {
    logger.info('LLM not configured; skipping repair-nightly');
    return 0;
  }

  const candidateRepo = new RepairCandidateRepository(database);
  const proposalRepo = new RepairProposalRepository(database);
  const batchSize = Number(process.env['REPAIR_NIGHTLY_BATCH']) || DEFAULT_BATCH;
  const candidates = await candidateRepo.listForNightlyRepair(batchSize);

  let processed = 0;
  for (const c of candidates) {
    const key = {
      portalHost: c.portalHost,
      recipeId: c.recipeId,
      step: c.step,
      skeletonHash: c.skeletonHash,
      gapKind: c.gapKind,
    };
    const weekly = await proposalRepo.countProposalsInWeek(key);
    if (weekly >= MAX_PROPOSALS_PER_WEEK) continue;

    const skeleton = await deps.loadSkeleton({ step: c.step, skeletonHash: c.skeletonHash });
    if (!skeleton) {
      logger.warn({ step: c.step, skeletonHash: c.skeletonHash }, 'no skeleton blob; skipping');
      continue;
    }

    const result = await runScraperRepairProposal({
      database,
      key,
      skeleton,
      selectorTableJson: selectorTableJsonForRecipe(c.recipeId),
      billingUserId: deps.billingUserId,
      skipPlanQuota: true,
    });
    if (result.status === 'proposed') {
      processed += 1;
    }
  }
  return processed;
}
