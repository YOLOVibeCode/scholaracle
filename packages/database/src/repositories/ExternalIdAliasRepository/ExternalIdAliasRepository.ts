import type { Collection, Db } from 'mongodb';
import type {
  ExternalIdAliasKind,
  IExternalIdAliasData,
} from '../../models/ExternalIdAlias/ExternalIdAlias';

export class ExternalIdAliasRepository {
  private readonly _collection: Collection<IExternalIdAliasData>;
  private readonly memory = new Map<string, string>();

  constructor(database: Db) {
    this._collection = database.collection<IExternalIdAliasData>('slc_external_id_aliases');
  }

  async upsertBuiltinAdapterAliases(aliases: Readonly<Record<string, string>>): Promise<number> {
    const kind: ExternalIdAliasKind = 'adapterId';
    const now = new Date();
    let count = 0;
    for (const [alias, canonicalAdapterId] of Object.entries(aliases)) {
      await this._collection.updateOne(
        { alias, kind },
        { $set: { alias, canonicalAdapterId, kind, updatedAt: now } },
        { upsert: true }
      );
      this.memory.set(alias, canonicalAdapterId);
      count++;
    }
    return count;
  }

  async resolveAdapterId(adapterId: string): Promise<string> {
    const cached = this.memory.get(adapterId);
    if (cached) return cached;

    const doc = await this._collection.findOne({
      alias: adapterId,
      kind: 'adapterId',
    });
    if (doc?.canonicalAdapterId) {
      this.memory.set(adapterId, doc.canonicalAdapterId);
      return doc.canonicalAdapterId;
    }
    return adapterId;
  }
}
