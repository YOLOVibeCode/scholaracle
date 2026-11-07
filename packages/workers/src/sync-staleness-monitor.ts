import { type Db, ObjectId } from 'mongodb';
import type { IEmailTransport } from '@scholaracle/agents';
import { getErrorReporter } from '@scholaracle/contracts';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// Sync Staleness Monitor
// ---------------------------------------------------------------------------
// Periodically checks all students with enabled data sources. If any source
// hasn't synced within the configured threshold, sends a single alert email
// to the account owner. Tracks which alerts have been sent so the same owner
// is not spammed on every tick.
// ---------------------------------------------------------------------------

export interface ISyncStalenessMonitorConfig {
  /** When false, start() does not schedule checks (default true). */
  readonly enabled?: boolean;
  /** Delay before the first check after start() (default 30 s). */
  readonly initialDelayMs?: number;
  /** How often to check for stale syncs (default 1 hour). */
  readonly checkIntervalMs?: number;
  /** How long without a sync before an alert is sent (default 48 hours). */
  readonly staleThresholdMs?: number;
  /** From email address for alert emails. */
  readonly fromEmail: string;
  /** From name for alert emails. */
  readonly fromName: string;
}

/** Env-driven fields for the staleness monitor (fromEmail/fromName set elsewhere). */
export type ISyncStalenessMonitorEnvConfig = Pick<
  ISyncStalenessMonitorConfig,
  'enabled' | 'initialDelayMs' | 'checkIntervalMs' | 'staleThresholdMs'
>;

/** A data source sub-document on a Student record. */
interface IStudentDataSource {
  readonly id?: string;
  readonly displayName?: string;
  readonly pluginId?: string;
  readonly enabled?: boolean;
  readonly lastScraped?: Date;
  readonly lastSuccess?: Date;
  readonly lastSuccessAt?: Date;
}

/** Minimal student document shape. */
interface IStudentRecord {
  readonly _id: unknown;
  readonly name?: string;
  readonly userId: unknown;
  readonly dataSources?: readonly IStudentDataSource[];
}

const DEFAULT_INITIAL_DELAY_MS = 30_000;
const DEFAULT_CHECK_INTERVAL_MS = 60 * 60_000; // 1 hour
const DEFAULT_STALE_THRESHOLD_MS = 48 * 60 * 60_000; // 48 hours

function parseEnvFlag(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  const v = raw.trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no';
}

function parseEnvMs(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function buildSyncStalenessConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ISyncStalenessMonitorEnvConfig {
  const intervalRaw = env['STALENESS_INTERVAL_MS'] ?? env['STALENESS_CHECK_INTERVAL_MS'];
  return {
    enabled: parseEnvFlag(env['STALENESS_ENABLED']),
    initialDelayMs: parseEnvMs(env['STALENESS_INITIAL_DELAY_MS'], DEFAULT_INITIAL_DELAY_MS),
    checkIntervalMs: parseEnvMs(intervalRaw, DEFAULT_CHECK_INTERVAL_MS),
    staleThresholdMs: parseEnvMs(env['STALENESS_THRESHOLD_MS'], DEFAULT_STALE_THRESHOLD_MS),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Prefer phone/CLI ingest `lastSuccessAt`, then legacy fields. Exported for tests. */
export function latestSyncDate(ds: IStudentDataSource): Date | null {
  const raw = ds.lastSuccessAt ?? ds.lastSuccess ?? ds.lastScraped;
  if (!raw) return null;
  return new Date(raw as unknown as string);
}

export function isDataSourceStale(ds: IStudentDataSource, staleThreshold: Date): boolean {
  const lastSynced = latestSyncDate(ds);
  return !lastSynced || lastSynced < staleThreshold;
}

function formatLastSynced(lastSynced: Date | null): string {
  return lastSynced
    ? lastSynced.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'never';
}

interface IStaleSourceLine {
  readonly studentName: string;
  readonly sourceName: string;
  readonly lastSynced: Date | null;
}

function buildStaleSourceTextLines(lines: readonly IStaleSourceLine[]): string {
  return lines
    .map((s) => {
      const lastStr = formatLastSynced(s.lastSynced);
      return `• ${s.studentName} — ${s.sourceName} (last synced: ${lastStr})`;
    })
    .join('\n');
}

function buildStaleSourceHtmlLines(lines: readonly IStaleSourceLine[]): string {
  return lines
    .map((s) => {
      const lastStr = formatLastSynced(s.lastSynced);
      const name = escapeHtml(s.studentName);
      const source = escapeHtml(s.sourceName);
      return `<li><strong>${name}</strong> &mdash; ${source} (last synced: ${lastStr})</li>`;
    })
    .join('\n');
}

export class SyncStalenessMonitor {
  private readonly _db: Db;
  private readonly _transport: IEmailTransport;
  private readonly _enabled: boolean;
  private readonly _initialDelayMs: number;
  private readonly _checkMs: number;
  private readonly _thresholdMs: number;
  private readonly _fromEmail: string;
  private readonly _fromName: string;
  private _interval: ReturnType<typeof setInterval> | null = null;
  private _initialTimer: ReturnType<typeof setTimeout> | null = null;

  /** Set of userId strings that have already been alerted in this process lifetime. Resets on restart. */
  private readonly _alertedOwners = new Set<string>();

  constructor(db: Db, transport: IEmailTransport, config: ISyncStalenessMonitorConfig) {
    this._db = db;
    this._transport = transport;
    this._enabled = config.enabled ?? true;
    this._initialDelayMs = config.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    this._checkMs = config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this._thresholdMs = config.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
    this._fromEmail = config.fromEmail;
    this._fromName = config.fromName;
  }

  public start(): void {
    if (!this._enabled) {
      logger.info({ job: 'staleness-monitor' }, 'staleness monitor disabled — not scheduling');
      return;
    }
    if (this._interval) return;
    const runSafely = (): void => {
      void this.runCheck().catch((e: unknown) => {
        logger.error({ err: e, job: 'staleness-monitor' }, 'staleness check failed');
        getErrorReporter().captureException(e, { job: 'staleness-monitor' });
      });
    };
    this._initialTimer = setTimeout(() => {
      this._initialTimer = null;
      runSafely();
    }, this._initialDelayMs);
    this._interval = setInterval(runSafely, this._checkMs);
    logger.info(
      {
        job: 'staleness-monitor',
        checkEveryMinutes: Math.round(this._checkMs / 60_000),
        thresholdHours: Math.round(this._thresholdMs / 3_600_000),
        initialDelayMs: this._initialDelayMs,
      },
      'staleness monitor started'
    );
  }

  public stop(): void {
    if (this._initialTimer) {
      clearTimeout(this._initialTimer);
      this._initialTimer = null;
    }
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

    const students = this._db.collection('students');
    const allStudents = (await students.find({}).toArray()) as unknown as IStudentRecord[];

    const staleByOwner = new Map<
      string,
      {
        ownerUserId: string;
        staleSources: IStaleSourceLine[];
      }
    >();

    for (const student of allStudents) {
      const sources = student.dataSources ?? [];
      for (const ds of sources) {
        if (ds.enabled === false) continue;

        if (isDataSourceStale(ds, staleThreshold)) {
          const ownerKey = String(student.userId);
          if (!staleByOwner.has(ownerKey)) {
            staleByOwner.set(ownerKey, { ownerUserId: ownerKey, staleSources: [] });
          }
          staleByOwner.get(ownerKey)!.staleSources.push({
            studentName: student.name ?? 'Unknown Student',
            sourceName: ds.displayName ?? ds.pluginId ?? 'Unknown Source',
            lastSynced: latestSyncDate(ds),
          });
        }
      }
    }

    if (staleByOwner.size === 0) return;

    const users = this._db.collection('users');
    for (const [ownerKey, info] of staleByOwner) {
      if (this._alertedOwners.has(ownerKey)) continue;

      let owner: Record<string, unknown> | null = null;
      try {
        owner = (await users.findOne({ _id: new ObjectId(ownerKey) })) as Record<
          string,
          unknown
        > | null;
      } catch {
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

  private async _sendStaleAlert(
    toEmail: string,
    ownerName: string,
    staleSources: readonly IStaleSourceLine[],
    thresholdHours: number
  ): Promise<void> {
    const sourceLines = buildStaleSourceTextLines(staleSources);
    const sourceHtmlLines = buildStaleSourceHtmlLines(staleSources);
    const safeOwner = escapeHtml(ownerName);
    const subject = `Scholaracle: Sync has not run in ${thresholdHours}+ hours`;

    const guidance =
      'Please open the app on your phone and run a sync for the affected student(s).';

    const text = `Hi ${ownerName},

We noticed the following data sources have not synced in over ${thresholdHours} hours:

${sourceLines}

This means grade and assignment updates may not be current. ${guidance}

If you believe this is an error, please contact support.

— The Scholaracle Team`;

    const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #d97706;">Sync Alert</h2>
  <p>Hi ${safeOwner},</p>
  <p>We noticed the following data sources have not synced in over <strong>${thresholdHours} hours</strong>:</p>
  <ul style="line-height: 1.8;">
    ${sourceHtmlLines}
  </ul>
  <p>This means grade and assignment updates may not be current. ${escapeHtml(guidance)}</p>
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
