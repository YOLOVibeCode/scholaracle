import type { Db } from 'mongodb';
import { BUILTIN_ADAPTER_ID_ALIASES } from '@scholaracle/scraper-core';
import { ExternalIdAliasRepository } from '@scholaracle/database';
import { countLegacyAdapterIds, rekeyAdapterIds } from '../scripts/rekey-adapter-ids-lib';

const MARKER_COLLECTION = 'one_time_migrations';
const MARKER_ID = 'rekey-adapter-ids';

interface ILog {
  info(obj: object, msg: string): void;
}

export type RekeyOnBootResult = 'disabled' | 'already-applied' | 'dry-run' | 'applied';

/**
 * One-time M2-10 re-key, run by the API itself so no shell access is needed.
 * REKEY_ADAPTER_IDS=dry-run logs the plan; =apply re-keys and writes a marker so a
 * later boot never repeats it. Unset the variable once the log shows the result.
 */
export async function rekeyAdapterIdsOnBoot(db: Db, log: ILog): Promise<RekeyOnBootResult> {
  const mode = process.env['REKEY_ADAPTER_IDS'];
  if (mode !== 'dry-run' && mode !== 'apply') return 'disabled';

  const markers = db.collection<{ _id: string; appliedAt: Date; stats: unknown }>(
    MARKER_COLLECTION
  );
  if (mode === 'apply' && (await markers.findOne({ _id: MARKER_ID }))) {
    log.info({ migration: MARKER_ID }, 'one-time migration already applied; skipping');
    return 'already-applied';
  }

  const apply = mode === 'apply';
  if (apply) {
    await new ExternalIdAliasRepository(db).upsertBuiltinAdapterAliases(BUILTIN_ADAPTER_ID_ALIASES);
  }
  const before = await countLegacyAdapterIds(db);
  const stats = await rekeyAdapterIds({ db, apply });
  const after = apply ? await countLegacyAdapterIds(db) : undefined;
  log.info({ migration: MARKER_ID, mode, before, stats, after }, 'one-time migration result');

  if (apply) {
    await markers.insertOne({ _id: MARKER_ID, appliedAt: new Date(), stats });
    return 'applied';
  }
  return 'dry-run';
}
