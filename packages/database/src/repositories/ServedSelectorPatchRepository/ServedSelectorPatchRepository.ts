import { ObjectId, type Collection, type Db } from 'mongodb';
import type { ISlcRepairCandidateKey, SelectorPatchLifecycleStatus } from '@scholaracle/contracts';
import { repairCandidateId } from '@scholaracle/contracts';

const COLLECTION = 'served_selector_patches';

export interface IServedSelectorPatchRecord extends ISlcRepairCandidateKey {
  readonly patchId: string;
  readonly candidateId: string;
  readonly selectors: Record<string, string>;
  readonly status: SelectorPatchLifecycleStatus;
  readonly servedAt: Date;
  readonly verifiedAt?: Date;
  readonly failureReason?: string;
  readonly proposalCreatedAt: Date;
}

export class ServedSelectorPatchRepository {
  private readonly _collection: Collection<IServedSelectorPatchRecord>;

  constructor(database: Db) {
    this._collection = database.collection<IServedSelectorPatchRecord>(COLLECTION);
  }

  async markServed(params: {
    readonly key: ISlcRepairCandidateKey;
    readonly selectors: Record<string, string>;
    readonly proposalCreatedAt: Date;
  }): Promise<string> {
    const id = new ObjectId();
    const patchId = id.toHexString();
    const servedAt = new Date();
    await this._collection.updateMany(
      {
        portalHost: params.key.portalHost,
        recipeId: params.key.recipeId,
        step: params.key.step,
        status: 'served',
      },
      { $set: { status: 'failed', failureReason: 'superseded', verifiedAt: servedAt } }
    );
    await this._collection.insertOne({
      ...params.key,
      patchId,
      candidateId: repairCandidateId(params.key),
      selectors: params.selectors,
      status: 'served',
      servedAt,
      proposalCreatedAt: params.proposalCreatedAt,
    });
    return patchId;
  }

  async findByPatchId(patchId: string): Promise<IServedSelectorPatchRecord | null> {
    return this._collection.findOne({ patchId });
  }

  async listServedForPortalHost(
    portalHost: string
  ): Promise<readonly IServedSelectorPatchRecord[]> {
    return this._collection.find({ portalHost, status: 'served' }).sort({ servedAt: -1 }).toArray();
  }

  async markVerified(patchId: string): Promise<boolean> {
    const res = await this._collection.updateOne(
      { patchId, status: 'served' },
      { $set: { status: 'verified', verifiedAt: new Date() } }
    );
    return res.matchedCount === 1;
  }

  async markFailed(patchId: string, failureReason: string): Promise<boolean> {
    const res = await this._collection.updateOne(
      { patchId, status: 'served' },
      { $set: { status: 'failed', failureReason, verifiedAt: new Date() } }
    );
    return res.matchedCount === 1;
  }
}
