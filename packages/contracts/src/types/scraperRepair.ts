import type { SlcSyncGapKind } from '../models/Ingest';
import type { ISlcRepairCandidateKey } from '../models/RepairCandidate';

export interface IScraperRepairTriageResult {
  readonly real: boolean;
  readonly step: string;
}

export interface IScraperRepairPatchResult {
  readonly step: string;
  readonly selectors: Record<string, string>;
  readonly confidence: number;
  readonly notes?: string;
}

export interface IScraperRepairStaffRequest extends ISlcRepairCandidateKey {
  /** When set, billed against this parent's plan quota (staff manual repair). */
  readonly billingUserId?: string;
  /** Inline skeleton JSON/text (already redacted on device); max 200 KB. */
  readonly skeleton?: string;
}

export function repairCandidateId(key: ISlcRepairCandidateKey): string {
  return [key.portalHost, key.recipeId, key.step, key.skeletonHash, key.gapKind].join('|');
}

export const SCRAPER_REPAIR_GAP_KINDS: readonly SlcSyncGapKind[] = [
  'no_grade_no_assignments',
  'no_assignments',
  'no_grade',
];
