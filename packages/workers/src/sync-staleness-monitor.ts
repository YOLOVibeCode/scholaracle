import { type Db, ObjectId } from 'mongodb';
import type { IEmailTransport } from '@scholaracle/agents';
import { getErrorReporter } from '@scholaracle/contracts';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Sync Staleness Monitor
// ---------------------------------------------------------------------------
// Periodically checks all students with enabled data sources. If any source
// hasn't been scraped within the configured threshold, sends a single alert
// email to the account owner. Tracks which alerts have been sent so the same
// owner is not spammed on every tick.
// ---------------------------------------------------------------------------

export interface ISyncStalenessMonitorConfig {
  /** How often to check for stale syncs (default 1 hour). */
  readonly checkIntervalMs?: number;
  /** How long without a sync before an alert is sent (default 48 hours). */
  readonly staleThresholdMs?: number;
  /** From email address for alert emails. */
  readonly fromEmail: string;
  /** From name for alert emails. */
  readonly fromName: string;
}

/** A data source sub-document on a Student record. */
interface IStudentDataSource {
  readonly id?: string;
  readonly displayName?: string;
  readonly pluginId?: string;
  readonly enabled?: boolean;
  readonly lastScraped?: Date;
  readonly lastSuccess?: Date;
}

/** Minimal student document shape. */
interface IStudentRecord {
  readonly _id: unknown;
  readonly name?: string;
  readonly userId: unknown;
  readonly dataSources?: readonly IStudentDataSource[];
}

const DEFAULT_CHECK_INTERVAL_MS = 60 * 60_000; // 1 hour
const DEFAULT_STALE_THRESHOLD_MS = 48 * 60 * 60_000; // 48 hours

export class SyncStalenessMonitor {
  private readonly _db: Db;
  private readonly _transport: IEmailTransport;
  private readonly _checkMs: number;
  private readonly _thresholdMs: number;
  private readonly _fromEmail: string;
  private readonly _fromName: string;
  private _interval: ReturnType<typeof setInterval> | null = null;

  /** Set of userId strings that have already been alerted in this process lifetime. Resets on restart. */
  private readonly _alertedOwners = new Set<string>();

  constructor(db: Db, transport: IEmailTransport, config: ISyncStalenessMonitorConfig) {
    this._db = db;
    this._transport = transport;
    this._checkMs = config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this._thresholdMs = config.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
    this._fromEmail = config.fromEmail;
    this._fromName = config.fromName;
  }

  public start(): void {
    if (this._interval) return;
    // Run first check after a short delay (let the worker finish bootstrapping)
    const runSafely = (): void => {
      void this.runCheck().catch((e: unknown) => {
        logger.error({ err: e, job: 'staleness-monitor' }, 'staleness check failed');
        getErrorReporter().captureException(e, { job: 'staleness-monitor' });
      });
    };
    setTimeout(runSafely, 30_000);
    this._interval = setInterval(runSafely, this._checkMs);
    logger.info(
      {
        job: 'staleness-monitor',
        checkEveryMinutes: Math.round(this._checkMs / 60_000),
        thresholdHours: Math.round(this._thresholdMs / 3_600_000),
      },
      'staleness monitor started'
    );
  }

  public stop(): void {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  // -------------------------------------------------------------------------
  // Core check
  // -------------------------------------------------------------------------

  public async runCheck(): Promise<void> {
    const now = Date.now();
    const staleThreshold = new Date(now - this._thresholdMs);

    // Find all students with enabled data sources
    const students = this._db.collection('students');
    const allStudents = (await students.find({}).toArray()) as unknown as IStudentRecord[];

    // Group stale sources by owner userId
    const staleByOwner = new Map<
      string,
      {
        ownerUserId: string;
        staleSources: { studentName: string; sourceName: string; lastScraped: Date | null }[];
      }
    >();

    for (const student of allStudents) {
      const sources = student.dataSources ?? [];
      for (const ds of sources) {
        if (ds.enabled === false) continue;

        const lastScraped = ds.lastScraped ? new Date(ds.lastScraped as unknown as string) : null;
        const isStale = !lastScraped || lastScraped < staleThreshold;

        if (isStale) {
          const ownerKey = String(student.userId);
          if (!staleByOwner.has(ownerKey)) {
            staleByOwner.set(ownerKey, { ownerUserId: ownerKey, staleSources: [] });
          }
          staleByOwner.get(ownerKey)!.staleSources.push({
            studentName: student.name ?? 'Unknown Student',
            sourceName: ds.displayName ?? ds.pluginId ?? 'Unknown Source',
            lastScraped,
          });
        }
      }
    }

    if (staleByOwner.size === 0) return;

    // Look up owner emails and send alerts
    const users = this._db.collection('users');
    for (const [ownerKey, info] of staleByOwner) {
      // Skip if we already alerted this owner
      if (this._alertedOwners.has(ownerKey)) continue;

      let owner: Record<string, unknown> | null = null;
      try {
        owner = (await users.findOne({ _id: new ObjectId(ownerKey) })) as Record<
          string,
          unknown
        > | null;
      } catch {
        // ownerKey may not be a valid ObjectId string — skip
        continue;
      }

      if (!owner?.['email']) {
        logger.warn({ ownerKey, job: 'staleness-monitor' }, 'owner has no email - skipping alert');
        continue;
      }

      const email = owner['email'] as string;
      const ownerName = (owner['name'] as string) ?? 'Parent';
      const thresholdHours = Math.round(this._thresholdMs / 3_600_000);

      try {
        await this._sendStaleAlert(email, ownerName, info.staleSources, thresholdHours);
        this._alertedOwners.add(ownerKey);
        logger.info(
          { email, staleCount: info.staleSources.length, job: 'staleness-monitor' },
          'stale-sync alert sent'
        );
      } catch (err) {
        logger.error({ err, email, job: 'staleness-monitor' }, 'failed to send stale-sync alert');
      }
    }
  }

  // -------------------------------------------------------------------------
  // Email
  // -------------------------------------------------------------------------

  private async _sendStaleAlert(
    toEmail: string,
    ownerName: string,
    staleSources: { studentName: string; sourceName: string; lastScraped: Date | null }[],
    thresholdHours: number
  ): Promise<void> {
    const sourceLines = staleSources
      .map((s) => {
        const lastStr = s.lastScraped
          ? s.lastScraped.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'never';
        return `• ${s.studentName} — ${s.sourceName} (last synced: ${lastStr})`;
      })
      .join('\n');

    const sourceHtmlLines = staleSources
      .map((s) => {
        const lastStr = s.lastScraped
          ? s.lastScraped.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : 'never';
        return `<li><strong>${s.studentName}</strong> &mdash; ${s.sourceName} (last synced: ${lastStr})</li>`;
      })
      .join('\n');

    const subject = `Scholaracle: Sync has not run in ${thresholdHours}+ hours`;

    const text = `Hi ${ownerName},

We noticed the following data sources have not synced in over ${thresholdHours} hours:

${sourceLines}

This means grade and assignment updates may not be current. This can happen if the worker process lost its database connection or if credentials need to be re-entered.

If you believe this is an error, please contact support.

— The Scholaracle Team`;

    const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #d97706;">Sync Alert</h2>
  <p>Hi ${ownerName},</p>
  <p>We noticed the following data sources have not synced in over <strong>${thresholdHours} hours</strong>:</p>
  <ul style="line-height: 1.8;">
    ${sourceHtmlLines}
  </ul>
  <p>This means grade and assignment updates may not be current. This can happen if the worker process lost its database connection or if credentials need to be re-entered.</p>
  <p>If you believe this is an error, please contact support.</p>
  <p style="color: #6b7280; font-size: 14px; margin-top: 24px;">— The Scholaracle Team</p>
</div>`;

    await this._transport.send({
      to: toEmail,
      from: { email: this._fromEmail, name: this._fromName },
      subject,
      text,
      html,
    });
  }

  /** Clear the alerted set (e.g. after a successful sync proves connectivity is restored). */
  public clearAlerts(): void {
    this._alertedOwners.clear();
  }
}
