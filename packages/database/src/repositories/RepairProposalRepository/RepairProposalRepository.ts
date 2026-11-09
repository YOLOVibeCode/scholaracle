import type { Collection, Db } from 'mongodb';
import type { ISlcRepairCandidateKey } from '@scholaracle/contracts';
import { repairCandidateId } from '@scholaracle/contracts';

const COLLECTION = 'repair_proposals';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface IRepairProposalRecord extends ISlcRepairCandidateKey {
  readonly candidateId: string;
  readonly selectors: Record<string, string>;
  readonly confidence: number;
  readonly notes?: string;
  readonly model: string;
  readonly createdAt: Date;
}

export class RepairProposalRepository {
  private readonly _collection: Collection<IRepairProposalRecord>;

  constructor(database: Db) {
    this._collection = database.collection<IRepairProposalRecord>(COLLECTION);
  }

  async countProposalsInWeek(key: ISlcRepairCandidateKey, now: Date = new Date()): Promise<number> {
    const since = new Date(now.getTime() - WEEK_MS);
    const candidateId = repairCandidateId(key);
    return this._collection.countDocuments({
      candidateId,
      createdAt: { $gte: since },
    });
  }

  async insertProposal(
    key: ISlcRepairCandidateKey,
    proposal: Omit<
      IRepairProposalRecord,
      keyof ISlcRepairCandidateKey | 'candidateId' | 'createdAt'
    >
  ): Promise<{ readonly createdAt: Date }> {
    const createdAt = new Date();
    await this._collection.insertOne({
      ...key,
      candidateId: repairCandidateId(key),
      ...proposal,
      createdAt,
    });
    return { createdAt };
  }

  async findLatestProposal(key: ISlcRepairCandidateKey): Promise<IRepairProposalRecord | null> {
    const candidateId = repairCandidateId(key);
    return this._collection.find({ candidateId }).sort({ createdAt: -1 }).limit(1).next();
  }
}
