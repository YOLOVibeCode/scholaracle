import type { Db } from 'mongodb';
import { backfillBindings } from './backfillBindingsLib';

const MARKER_COLLECTION = 'one_time_migrations';
const MARKER_ID = 'backfill-bindings';

interface ILog {
  info(obj: object, msg: string): void;
}

export type BackfillBindingsOnBootResult = 'disabled' | 'already-applied' | 'dry-run' | 'applied';

/**
 * One-time binding backfill for legacy installs.
 * BACKFILL_BINDINGS=dry-run logs counts; =apply upserts and writes a marker.
 */
export async function backfillBindingsOnBoot(
  db: Db,
  log: ILog
): Promise<BackfillBindingsOnBootResult> {
  const mode = process.env['BACKFILL_BINDINGS'];
  if (mode !== 'dry-run' && mode !== 'apply') return 'disabled';

  const markers = db.collection<{ _id: string; appliedAt: Date; stats: unknown }>(
    MARKER_COLLECTION
  );
  if (mode === 'apply' && (await markers.findOne({ _id: MARKER_ID }))) {
    log.info({ migration: MARKER_ID }, 'one-time migration already applied; skipping');
    return 'already-applied';
  }

  const apply = mode === 'apply';
  const stats = await backfillBindings({ db, apply });
  log.info({ migration: MARKER_ID, mode, stats }, 'one-time migration result');

  if (apply) {
    await markers.insertOne({ _id: MARKER_ID, appliedAt: new Date(), stats });
    return 'applied';
  }
  return 'dry-run';
}
