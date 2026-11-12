import type { Db } from 'mongodb';
import {
  BulkUpdater,
  runOneTimeMigration,
  type ILog,
  type OneTimeMigrationResult,
} from './oneTimeMigrationMarker';

const MARKER_ID = 'alert-ack-by';

export type AlertAckByOnBootResult = OneTimeMigrationResult;

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
 * entry are left alone, so a rerun changes nothing. Writes go out in `bulkWrite` batches.
 * Legacy fields are kept for one release.
 */
export async function backfillAcknowledgedBy(db: Db, apply: boolean): Promise<IAlertAckByStats> {
  const alerts = db.collection<ILegacyAlertDoc>('alerts');
  const writer = new BulkUpdater(alerts, apply);
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
    const at = asDate(doc.acknowledgedAt) ?? asDate(doc.createdAt) ?? new Date();
    await writer.add({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { [`acknowledgedBy.${owner}`]: at.toISOString() } },
      },
    });
  }
  await writer.flush();
  return { scanned, updated, skipped };
}

/**
 * One-time S3 backfill, run by the API itself so no shell access is needed.
 * ALERT_ACK_BY_MIGRATION=dry-run logs the plan; =apply writes `acknowledgedBy[owner]` and
 * claims the `one_time_migrations` marker `alert-ack-by` atomically, so a later boot or a
 * sibling replica never repeats it. Unset the variable once the log shows the result.
 */
export async function alertAckByOnBoot(db: Db, log: ILog): Promise<AlertAckByOnBootResult> {
  return runOneTimeMigration({
    db,
    log,
    envVar: 'ALERT_ACK_BY_MIGRATION',
    markerId: MARKER_ID,
    work: (apply) => backfillAcknowledgedBy(db, apply),
  });
}
