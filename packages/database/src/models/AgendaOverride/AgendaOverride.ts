import type { ObjectId } from 'mongodb';

export type AgendaItemType = 'assignment' | 'event_occurrence';
export type AgendaOverrideScope = 'occurrence' | 'series';

export interface IAgendaOverrideData {
  readonly userId: ObjectId | string;
  readonly itemType: AgendaItemType;
  readonly itemKey: string; // derived stable key (e.g., seriesKey+occurrenceStartAt hash)
  readonly scope: AgendaOverrideScope;
  readonly snoozedUntil: Date;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export class AgendaOverride {
  public readonly _id?: ObjectId;
  public readonly userId: ObjectId | string;
  public readonly itemType: AgendaItemType;
  public readonly itemKey: string;
  public readonly scope: AgendaOverrideScope;
  public readonly snoozedUntil: Date;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: IAgendaOverrideData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.itemType = data.itemType;
    this.itemKey = data.itemKey;
    this.scope = data.scope;
    this.snoozedUntil = data.snoozedUntil;
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }
}
