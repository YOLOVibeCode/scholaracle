import {
  SLC_INGEST_SCHEMA_VERSION_V1,
  type ISlcIngestEnvelopeV1,
  type ISlcDeltaOp,
} from '@scholaracle/contracts';
import type {
  ILmsAdapterWithTest,
  ILmsAdapterMeta,
  ILmsCredentials,
  IFetchEnvelopeParams,
  IConnectionTestResult,
} from '../adapter';
import { SkywardClient, type ISkywardExtendedScraper } from './skyward-client';
import {
  transformReportToGradeOps,
  transformGradebookToAssignmentOps,
  transformSkywardCourseToOp,
  transformAttendanceToOp,
  transformScheduleToTeacherOp,
  transformDocumentToOp,
  transformMessageToOp,
} from './skyward-transformer';

/**
 * Factory for creating a Skyward scraper from a login URL.
 * In production: `(url) => require('skyward-rest')(url)`.
 * For tests: inject a mock.
 */
export type SkywardScraperFactory = (loginUrl: string) => ISkywardExtendedScraper;

/**
 * Skyward adapter.
 * Implements ILmsAdapter by scraping data from the Skyward parent portal
 * via the skyward-rest library and transforming it into ISlcIngestEnvelopeV1.
 */
export class SkywardAdapter implements ILmsAdapterWithTest {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'skyward',
    adapterId: 'com.skyward',
    adapterVersion: '0.1.0',
    displayName: 'Skyward',
  };

  private _client: SkywardClient | undefined;
  private _isAuthenticated = false;
  private readonly _scraperFactory: SkywardScraperFactory;

  constructor(scraperFactory: SkywardScraperFactory) {
    this._scraperFactory = scraperFactory;
  }

  public async authenticate(credentials: ILmsCredentials): Promise<void> {
    if (!credentials.username || !credentials.password) {
      throw new Error('Skyward adapter requires username and password');
    }
    if (!credentials.baseUrl) {
      throw new Error('Skyward adapter requires baseUrl (district login URL)');
    }
    const scraper = this._scraperFactory(credentials.baseUrl);
    this._client = new SkywardClient(
      {
        loginUrl: credentials.baseUrl,
        username: credentials.username,
        password: credentials.password,
      },
      scraper
    );
    this._isAuthenticated = true;
  }

  public isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  public async testConnection(): Promise<IConnectionTestResult> {
    const start = Date.now();
    if (!this._client) {
      return { success: false, message: 'Not authenticated. Call authenticate() first.', durationMs: Date.now() - start };
    }
    try {
      const report = await this._client.getReport();
      return {
        success: true,
        message: `Connected — found ${report.length} course${report.length !== 1 ? 's' : ''} on report card`,
        durationMs: Date.now() - start,
        details: { courseCount: report.length },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "stuGradesGrid not found" means login succeeded but there are no current grades
      // (e.g. between semesters, summer, new student). This is a valid connection.
      if (msg.includes('stuGradesGrid not found') || msg.includes('not found')) {
        return {
          success: true,
          message: 'Connected — no current grades found (the student may not have active courses)',
          durationMs: Date.now() - start,
          details: { courseCount: 0 },
        };
      }
      return { success: false, message: `Connection failed: ${msg}`, durationMs: Date.now() - start };
    }
  }

  public async fetchEnvelope(params: IFetchEnvelopeParams): Promise<ISlcIngestEnvelopeV1> {
    if (!this._client) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const now = new Date().toISOString();
    const ops = await this._fetchAllOps();

    return {
      schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
      run: {
        runId: params.runId,
        startedAt: now,
        provider: this.meta.provider,
        adapterId: this.meta.adapterId,
        adapterVersion: this.meta.adapterVersion,
        mode: 'delta',
        timezone: 'UTC',
      },
      source: {
        sourceId: params.sourceId,
        displayName: params.displayName,
        portalBaseUrl: params.portalBaseUrl,
      },
      ops,
    };
  }

  private async _fetchAllOps(): Promise<readonly ISlcDeltaOp[]> {
    const client = this._client!;
    const ops: ISlcDeltaOp[] = [];
    const warnings: string[] = [];

    const baseKey = {
      provider: this.meta.provider,
      adapterId: this.meta.adapterId,
      studentExternalId: 'self',
      institutionExternalId: 'skyward-instance',
    };

    // ---- Phase 1: Grades (report card + per-course gradebooks) ----
    let report: Awaited<ReturnType<typeof client.getReport>>;
    try {
      report = await client.getReport();
    } catch {
      // No current grades (stuGradesGrid not found) — still continue with other phases
      report = [];
      warnings.push('No current grades found on report card (between semesters or new student)');
    }

    for (const courseReport of report) {
      const gradeOps = transformReportToGradeOps(courseReport, baseKey);
      ops.push(...(gradeOps as unknown as ISlcDeltaOp[]));

      // Scrape detailed gradebook for each course (first available bucket)
      const firstBucket = courseReport.scores[0]?.bucket;
      if (firstBucket) {
        try {
          const gradebook = await client.getGradebook(courseReport.course, firstBucket);

          // Course op (with subject reconciliation)
          ops.push(
            transformSkywardCourseToOp(gradebook, courseReport.course, baseKey) as unknown as ISlcDeltaOp
          );

          // Assignment ops (every assignment in every category)
          const assignmentOps = transformGradebookToAssignmentOps(
            gradebook,
            courseReport.course,
            baseKey
          );
          ops.push(...(assignmentOps as unknown as ISlcDeltaOp[]));
        } catch {
          warnings.push(`Could not scrape gradebook for course ${courseReport.course}`);
        }
      }
    }

    // ---- Phase 2: Schedule + Teachers (if scraper supports it) ----
    try {
      const schedule = await client.getSchedule();
      for (const entry of schedule) {
        ops.push(
          transformScheduleToTeacherOp(entry, baseKey) as unknown as ISlcDeltaOp
        );
      }
    } catch {
      warnings.push('Could not scrape schedule/teacher data');
    }

    // ---- Phase 3: Attendance (if scraper supports it) ----
    try {
      const attendance = await client.getAttendance();
      for (const record of attendance) {
        ops.push(
          transformAttendanceToOp(record, baseKey) as unknown as ISlcDeltaOp
        );
      }
    } catch {
      warnings.push('Could not scrape attendance data');
    }

    // ---- Phase 4: Documents / Materials (if scraper supports it) ----
    try {
      const documents = await client.getDocuments();
      for (const doc of documents) {
        ops.push(
          transformDocumentToOp(doc, baseKey) as unknown as ISlcDeltaOp
        );
      }
    } catch {
      warnings.push('Could not scrape documents');
    }

    // ---- Phase 5: Messages (if scraper supports it) ----
    try {
      const messages = await client.getMessages();
      for (const msg of messages) {
        ops.push(
          transformMessageToOp(msg, baseKey) as unknown as ISlcDeltaOp
        );
      }
    } catch {
      warnings.push('Could not scrape messages');
    }

    return ops;
  }
}
