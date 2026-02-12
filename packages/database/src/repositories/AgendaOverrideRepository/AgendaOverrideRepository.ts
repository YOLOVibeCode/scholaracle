import type { Collection, Db, ObjectId } from 'mongodb';
import {
  AgendaOverride,
  type AgendaItemType,
  type AgendaOverrideScope,
  type IAgendaOverrideData,
} from '../../models/AgendaOverride';

export interface IAgendaOverrideReader {
  listActiveSnoozes(params: {
    readonly userId: ObjectId | string;
    readonly now?: Date;
  }): Promise<readonly AgendaOverride[]>;
}

export interface IAgendaOverrideWriter {
  upsertSnooze(params: {
    readonly userId: ObjectId | string;
    readonly itemType: AgendaItemType;
    readonly itemKey: string;
    readonly scope: AgendaOverrideScope;
    readonly snoozedUntil: Date;
  }): Promise<AgendaOverride>;
}

export class AgendaOverrideRepository implements IAgendaOverrideReader, IAgendaOverrideWriter {
  private readonly _collection: Collection<IAgendaOverrideData>;

  constructor(database: Db) {
    this._collection = database.collection<IAgendaOverrideData>('agenda_overrides');
  }

  async upsertSnooze(params: {
    readonly userId: ObjectId | string;
    readonly itemType: AgendaItemType;
    readonly itemKey: string;
    readonly scope: AgendaOverrideScope;
    readonly snoozedUntil: Date;
  }): Promise<AgendaOverride> {
    const now = new Date();
    const doc: IAgendaOverrideData = {
      userId: params.userId,
      itemType: params.itemType,
      itemKey: params.itemKey,
      scope: params.scope,
      snoozedUntil: params.snoozedUntil,
      updatedAt: now,
      createdAt: now,
    };

    await this._collection.updateOne(
      {
        userId: params.userId,
        itemType: params.itemType,
        itemKey: params.itemKey,
        scope: params.scope,
      },
      { $set: doc },
      { upsert: true }
    );

    const stored = await this._collection.findOne({
      userId: params.userId,
      itemType: params.itemType,
      itemKey: params.itemKey,
      scope: params.scope,
    });

    return new AgendaOverride(stored ?? doc);
  }

  async listActiveSnoozes(params: {
    readonly userId: ObjectId | string;
    readonly now?: Date;
  }): Promise<readonly AgendaOverride[]> {
    const now = params.now ?? new Date();
    const docs = await this._collection
      .find({ userId: params.userId, snoozedUntil: { $gt: now } })
      .toArray();
    return docs.map((d) => new AgendaOverride(d, d._id as unknown as ObjectId));
  }
}
