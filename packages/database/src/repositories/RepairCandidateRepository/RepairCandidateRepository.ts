import type { Collection, Db } from 'mongodb';
import type { ISlcRepairCandidateKey, IRepairCandidateData } from '@scholaracle/contracts';
import { RepairCandidate } from '../../models/RepairCandidate';

const COLLECTION = 'repair_candidates';

export class RepairCandidateRepository {
  private readonly _collection: Collection<IRepairCandidateData>;

  constructor(database: Db) {
    this._collection = database.collection<IRepairCandidateData>(COLLECTION);
  }

  async recordSightings(keys: readonly ISlcRepairCandidateKey[]): Promise<void> {
    if (keys.length === 0) return;
    const now = new Date();
    await Promise.all(
      keys.map((key) =>
        this._collection.updateOne(
          {
            portalHost: key.portalHost,
            recipeId: key.recipeId,
            step: key.step,
            skeletonHash: key.skeletonHash,
            gapKind: key.gapKind,
          },
          {
            $inc: { seenCount: 1 },
            $set: { lastSeenAt: now },
            $setOnInsert: { firstSeenAt: now },
          },
          { upsert: true }
        )
      )
    );
  }

  async findByKey(key: ISlcRepairCandidateKey): Promise<RepairCandidate | null> {
    const doc = await this._collection.findOne({
      portalHost: key.portalHost,
      recipeId: key.recipeId,
      step: key.step,
      skeletonHash: key.skeletonHash,
      gapKind: key.gapKind,
    });
    if (!doc) return null;
    return new RepairCandidate(doc);
  }
}
