import type { Db } from 'mongodb';
import type { ISlcRepairCandidateKey } from '@scholaracle/contracts';
import {
  RepairCandidateRepository,
  RepairProposalRepository,
  ServedSelectorPatchRepository,
} from '@scholaracle/database';
import { replaySelectorPatch } from '@scholaracle/scraper-core';
import { createLogger } from '@scholaracle/logger';

const logger = createLogger('selector-patch-verify');

export type VerifyAndServeResult = 'served' | 'replay_failed' | 'no_proposal';

export async function verifyAndServeProposal(
  database: Db,
  key: ISlcRepairCandidateKey,
  selectorPatch: Record<string, string>
): Promise<VerifyAndServeResult> {
  const proposalRepo = new RepairProposalRepository(database);
  const latest = await proposalRepo.findLatestProposal(key);
  if (!latest) return 'no_proposal';

  const replay = await replaySelectorPatch({
    recipeId: key.recipeId,
    step: key.step,
    selectorPatch,
  });
  const candidateRepo = new RepairCandidateRepository(database);
  if (!replay.ok) {
    const reason = replay.reason ?? 'replay counts below standard';
    await candidateRepo.attachFailure(key, reason);
    logger.info({ key, reason }, 'selector patch replay failed');
    return 'replay_failed';
  }

  const servedRepo = new ServedSelectorPatchRepository(database);
  await servedRepo.markServed({
    key,
    selectors: selectorPatch,
    proposalCreatedAt: latest.createdAt,
  });
  logger.info({ key }, 'selector patch served for district');
  return 'served';
}
