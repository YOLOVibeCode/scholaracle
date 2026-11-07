import type { SlcSyncGapKind } from './Ingest';

/** District-level dedupe key for scraper repair queue rows. */
export interface ISlcRepairCandidateKey {
  readonly portalHost: string;
  readonly recipeId: string;
  readonly step: string;
  readonly skeletonHash: string;
  readonly gapKind: SlcSyncGapKind;
}

export interface IRepairCandidateData extends ISlcRepairCandidateKey {
  readonly seenCount: number;
  readonly firstSeenAt: Date;
  readonly lastSeenAt: Date;
}
