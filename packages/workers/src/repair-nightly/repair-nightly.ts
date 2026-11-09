import type { Db } from 'mongodb';
import type { ISlcRepairCandidateKey } from '@scholaracle/contracts';
import { runScraperRepairProposal, resolveLlmConfig } from '@scholaracle/agents';
import { RepairCandidateRepository, RepairProposalRepository } from '@scholaracle/database';
import { selectorTableJsonForRecipe } from './selectorTableJson';
import { logger } from '../logger';

const DEFAULT_BATCH = 25;
const MAX_PROPOSALS_PER_WEEK = 3;

export interface IRepairNightlyDeps {
  readonly loadSkeleton: (key: { step: string; skeletonHash: string }) => Promise<string | null>;
  readonly billingUserId: string;
  /** Test overrides */
  readonly resolveLlmConfigFn?: typeof resolveLlmConfig;
  readonly runScraperRepairProposalFn?: typeof runScraperRepairProposal;
  readonly verifyAndServe?: (
    key: ISlcRepairCandidateKey,
    selectors: Record<string, string>
  ) => Promise<'served' | 'replay_failed' | 'no_proposal'>;
}

export async function runRepairNightly(database: Db, deps: IRepairNightlyDeps): Promise<number> {
  const resolveLlm = deps.resolveLlmConfigFn ?? resolveLlmConfig;
  const runProposal = deps.runScraperRepairProposalFn ?? runScraperRepairProposal;

  if (!resolveLlm('triage')) {
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

    const result = await runProposal({
      database,
      key,
      skeleton,
      selectorTableJson: selectorTableJsonForRecipe(c.recipeId),
      billingUserId: deps.billingUserId,
      skipPlanQuota: true,
    });
    if (result.status === 'proposed' && result.patch) {
      processed += 1;
      if (deps.verifyAndServe) {
        await deps.verifyAndServe(key, result.patch.selectors);
      }
    }
  }
  return processed;
}
