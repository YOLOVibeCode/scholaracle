import type { ObjectId } from 'mongodb';
import type { IRepairCandidateData } from '@scholaracle/contracts';

export type { IRepairCandidateData, ISlcRepairCandidateKey } from '@scholaracle/contracts';

export class RepairCandidate {
  public readonly _id?: ObjectId;
  public readonly portalHost: string;
  public readonly recipeId: string;
  public readonly step: string;
  public readonly skeletonHash: string;
  public readonly gapKind: IRepairCandidateData['gapKind'];
  public readonly seenCount: number;
  public readonly firstSeenAt: Date;
  public readonly lastSeenAt: Date;

  constructor(data: IRepairCandidateData, id?: ObjectId) {
    this._id = id;
    this.portalHost = data.portalHost;
    this.recipeId = data.recipeId;
    this.step = data.step;
    this.skeletonHash = data.skeletonHash;
    this.gapKind = data.gapKind;
    this.seenCount = data.seenCount;
    this.firstSeenAt = data.firstSeenAt;
    this.lastSeenAt = data.lastSeenAt;
  }
}
