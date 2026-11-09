import type { Db } from 'mongodb';

const MARKER_COLLECTION = 'one_time_migrations';
const MARKER_ID = 'alert-ack-by';

interface ILog {
  info(obj: object, msg: string): void;
}

export type AlertAckByOnBootResult = 'disabled' | 'already-applied' | 'dry-run' | 'applied';

export interface IAlertAckByStats {
  /** Alerts with the legacy `acknowledged: true`. */
  readonly scanned: number;
  /** Alerts that got (or, in dry-run, would get) `acknowledgedBy[owner]`. */
  readonly updated: number;
  /** Alerts already carrying the owner's entry, or with no usable owner id. */
  readonly skipped: number;
}

interface ILegacyAlertDoc {
  readonly _id: unknown;
  readonly userId?: unknown;
  readonly acknowledgedAt?: unknown;
  readonly createdAt?: unknown;
  readonly acknowledgedBy?: Record<string, unknown>;
}

function asDate(value: unknown): Date | undefined {
  return value instanceof Date ? value : undefined;
}

/**
 * Copy the legacy owner acknowledgement (`acknowledged` / `acknowledgedAt`) into
 * `acknowledgedBy[owner]` (sharing-spec §4.5). Idempotent: rows that already carry the owner's
 * entry are left alone, so a rerun changes nothing. Legacy fields are kept for one release.
 */
export async function backfillAcknowledgedBy(db: Db, apply: boolean): Promise<IAlertAckByStats> {
  const alerts = db.collection<ILegacyAlertDoc>('alerts');
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const cursor = alerts.find({ acknowledged: true });
  for await (const doc of cursor) {
    scanned += 1;
    const owner = typeof doc.userId === 'string' ? doc.userId : '';
    const existing = owner ? doc.acknowledgedBy?.[owner] : undefined;
    if (!owner || (typeof existing === 'string' && existing !== '')) {
      skipped += 1;
      continue;
    }
    updated += 1;
    if (!apply) continue;
    const at = asDate(doc.acknowledgedAt) ?? asDate(doc.createdAt) ?? new Date();
    await alerts.updateOne(
      { _id: doc._id },
      { $set: { [`acknowledgedBy.${owner}`]: at.toISOString() } }
    );
  }
  return { scanned, updated, skipped };
}

/**
 * One-time S3 backfill, run by the API itself so no shell access is needed.
 * ALERT_ACK_BY_MIGRATION=dry-run logs the plan; =apply writes `acknowledgedBy[owner]` and a
 * marker so a later boot never repeats it. Unset the variable once the log shows the result.
 */
export async function alertAckByOnBoot(db: Db, log: ILog): Promise<AlertAckByOnBootResult> {
  const mode = process.env['ALERT_ACK_BY_MIGRATION'];
  if (mode !== 'dry-run' && mode !== 'apply') return 'disabled';

  const markers = db.collection<{ _id: string; appliedAt: Date; stats: unknown }>(
    MARKER_COLLECTION
  );
  if (mode === 'apply' && (await markers.findOne({ _id: MARKER_ID }))) {
    log.info({ migration: MARKER_ID }, 'one-time migration already applied; skipping');
    return 'already-applied';
  }

  const apply = mode === 'apply';
  const stats = await backfillAcknowledgedBy(db, apply);
  log.info({ migration: MARKER_ID, mode, stats }, 'one-time migration result');

  if (apply) {
    await markers.insertOne({ _id: MARKER_ID, appliedAt: new Date(), stats });
    return 'applied';
  }
  return 'dry-run';
}
