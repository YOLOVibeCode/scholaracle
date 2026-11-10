import type { Db } from 'mongodb';
import { AiBudgetError, type ISlcRepairCandidateKey } from '@scholaracle/contracts';
import { repairCandidateId } from '@scholaracle/contracts';
import {
  AiUsageRepository,
  RepairProposalRepository,
  type IAiUsageCostRecord,
} from '@scholaracle/database';
import { LlmClient } from '../ai/llm-client';
import { resolveLlmConfig } from '../ai/llm-config';
import { buildRepairPromptPrefix, TRIAGE_SYSTEM } from './prompts';
import { parsePatchJson, parseTriageJson } from './parse';
import { estimateRelayCostUsd } from './cost';

const MAX_PROPOSALS_PER_WEEK = 3;

export type ScraperRepairQuotaResult =
  { readonly ok: true } | { readonly ok: false; readonly status: 429; readonly message: string };

export interface IRunScraperRepairProposalParams {
  readonly database: Db;
  readonly key: ISlcRepairCandidateKey;
  readonly skeleton: string;
  readonly selectorTableJson: string;
  readonly billingUserId: string;
  readonly skipPlanQuota?: boolean;
  readonly checkPlanQuota?: (db: Db, userId: string) => Promise<ScraperRepairQuotaResult>;
  readonly triageClient?: LlmClient;
  readonly patchClient?: LlmClient;
}

export interface IRunScraperRepairProposalResult {
  readonly status:
    'proposed' | 'skipped_not_real' | 'skipped_weekly_cap' | 'quota_exceeded' | 'budget_exceeded';
  readonly patch?: ReturnType<typeof parsePatchJson>;
}

async function recordCallCost(
  database: Db,
  billingUserId: string,
  model: string,
  usage: { inputTokens: number; outputTokens: number },
  repairCandidateId: string
): Promise<void> {
  const repo = new AiUsageRepository(database);
  const row: IAiUsageCostRecord = {
    userId: billingUserId,
    feature: 'scraper_repair',
    at: new Date(),
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd: estimateRelayCostUsd(usage.inputTokens, usage.outputTokens),
    repairCandidateId,
  };
  await repo.recordCost(row);
}

export async function runScraperRepairProposal(
  params: IRunScraperRepairProposalParams
): Promise<IRunScraperRepairProposalResult> {
  const proposalRepo = new RepairProposalRepository(params.database);
  const weekly = await proposalRepo.countProposalsInWeek(params.key);
  if (weekly >= MAX_PROPOSALS_PER_WEEK) {
    return { status: 'skipped_weekly_cap' };
  }

  if (!params.skipPlanQuota && params.checkPlanQuota) {
    const quota = await params.checkPlanQuota(params.database, params.billingUserId);
    if (!quota.ok) {
      return { status: 'quota_exceeded' };
    }
  }

  let triage: LlmClient;
  let patch: LlmClient;
  if (params.triageClient && params.patchClient) {
    triage = params.triageClient;
    patch = params.patchClient;
  } else {
    const triageCfg = resolveLlmConfig('triage');
    const patchCfg = resolveLlmConfig('patch');
    if (!triageCfg || !patchCfg) {
      throw new Error('LLM is not configured');
    }
    triage = new LlmClient({
      apiKey: triageCfg.apiKey,
      baseUrl: triageCfg.baseUrl,
      model: triageCfg.model,
    });
    patch = new LlmClient({
      apiKey: patchCfg.apiKey,
      baseUrl: patchCfg.baseUrl,
      model: patchCfg.model,
    });
  }

  const candidateId = repairCandidateId(params.key);
  const triageUser = JSON.stringify({
    step: params.key.step,
    gapKind: params.key.gapKind,
    skeleton: params.skeleton.slice(0, 8000),
  });
  try {
    const triageRes = await triage.complete([{ role: 'user', content: triageUser }], {
      maxTokens: 256,
      system: TRIAGE_SYSTEM,
    });
    await recordCallCost(
      params.database,
      params.billingUserId,
      triage.model,
      triageRes.usage,
      candidateId
    );

    const triageParsed = parseTriageJson(triageRes.content);
    if (!triageParsed.real) {
      return { status: 'skipped_not_real' };
    }

    const systemPrefix = buildRepairPromptPrefix({
      recipeId: params.key.recipeId,
      step: params.key.step,
      selectorTableJson: params.selectorTableJson,
    });
    const patchUser = JSON.stringify({
      step: params.key.step,
      portalHost: params.key.portalHost,
      skeleton: params.skeleton,
      triageStep: triageParsed.step,
    });
    const patchRes = await patch.complete([{ role: 'user', content: patchUser }], {
      maxTokens: 2048,
      system: systemPrefix,
      cacheSystemPrefix: true,
    });
    await recordCallCost(
      params.database,
      params.billingUserId,
      patch.model,
      patchRes.usage,
      candidateId
    );

    const patchParsed = parsePatchJson(patchRes.content);
    await proposalRepo.insertProposal(params.key, {
      selectors: patchParsed.selectors,
      confidence: patchParsed.confidence,
      ...(patchParsed.notes ? { notes: patchParsed.notes } : {}),
      model: patch.model,
    });

    return { status: 'proposed', patch: patchParsed };
  } catch (err: unknown) {
    if (err instanceof AiBudgetError) {
      return { status: 'budget_exceeded' };
    }
    throw err;
  }
}
