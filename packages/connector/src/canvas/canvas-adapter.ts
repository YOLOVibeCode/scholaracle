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
import { classifyAssetPriority, compareAssetPriority } from '../asset-downloader';
import type { ICanvasFile, ICanvasPage } from './canvas-client';
import { CanvasClient } from './canvas-client';
import {
  transformAssignmentToOp,
  transformCalendarEventToOp,
  transformFileToOp,
  transformPageToOp,
} from './canvas-transformer';

/**
 * Canvas LMS adapter scaffold.
 * Implements ILmsAdapter by fetching data from Canvas REST API
 * and transforming it into ISlcIngestEnvelopeV1.
 */
export class CanvasAdapter implements ILmsAdapterWithTest {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'canvas',
    adapterId: 'com.instructure.canvas',
    adapterVersion: '0.1.0',
    displayName: 'Canvas LMS',
  };

  private _client: CanvasClient | undefined;
  private _isAuthenticated = false;

  public async authenticate(credentials: ILmsCredentials): Promise<void> {
    if (!credentials.accessToken) {
      throw new Error('Canvas adapter requires an accessToken');
    }
    this._client = new CanvasClient({
      baseUrl: credentials.baseUrl,
      accessToken: credentials.accessToken,
    });
    this._isAuthenticated = true;
  }

  public isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  public async testConnection(): Promise<IConnectionTestResult> {
    const start = Date.now();
    if (!this._client) {
      return {
        success: false,
        message: 'Not authenticated. Call authenticate() first.',
        durationMs: Date.now() - start,
      };
    }
    try {
      const [user, courses] = await Promise.all([
        this._client.getSelf(),
        this._client.getCourses(),
      ]);
      return {
        success: true,
        message: `Connected as ${user.name} — found ${courses.length} course${courses.length !== 1 ? 's' : ''}`,
        durationMs: Date.now() - start,
        details: { courseCount: courses.length, userName: user.name },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Connection failed: ${msg}`,
        durationMs: Date.now() - start,
      };
    }
  }

  public async fetchEnvelope(params: IFetchEnvelopeParams): Promise<ISlcIngestEnvelopeV1> {
    if (!this._client) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    const now = new Date().toISOString();
    const ops = await this._fetchAllOps(params);

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

  // eslint-disable-next-line complexity
  private async _fetchAllOps(params: IFetchEnvelopeParams): Promise<readonly ISlcDeltaOp[]> {
    const client = this._client!;
    const ops: ISlcDeltaOp[] = [];
    const downloader = params.assetDownloader;
    const syncState = params.syncState;
    const downloadHeaders = params.assetDownloadHeaders ?? {};
    const priorityFilter = params.assetPriorityFilter ?? 'all';

    const baseKey = {
      provider: this.meta.provider,
      adapterId: this.meta.adapterId,
      studentExternalId: 'self',
      institutionExternalId: 'canvas-instance',
    };

    const courses = await client.getCourses();

    for (const course of courses) {
      let files: readonly ICanvasFile[] = [];
      let pages: readonly ICanvasPage[] = [];
      try {
        [files, pages] = await Promise.all([
          client.getFiles(course.id),
          client.getPages(course.id),
        ]);
      } catch {
        // Skip materials for this course (e.g. 403) without aborting the sync.
      }

      const [assignments, submissions] = await Promise.all([
        client.getAssignments(course.id),
        client.getSubmissions(course.id),
      ]);

      for (const assignment of assignments) {
        const submission = submissions.find((s) => s.assignment_id === assignment.id);
        // ISlcAssignment lacks index signature for Record<string, unknown> compat
        ops.push(
          transformAssignmentToOp(assignment, submission, baseKey) as unknown as ISlcDeltaOp
        );
      }

      const filesSorted = downloader
        ? [...files].sort((a, b) => {
            const pa = classifyAssetPriority({
              fileName: a.filename,
              mimeType: a.content_type,
              fileSize: a.size,
              postedAt: a.created_at,
              displayName: a.display_name,
            });
            const pb = classifyAssetPriority({
              fileName: b.filename,
              mimeType: b.content_type,
              fileSize: b.size,
              postedAt: b.created_at,
              displayName: b.display_name,
            });
            return compareAssetPriority(pa, pb);
          })
        : files;

      for (const file of filesSorted) {
        let op = transformFileToOp(file, course.id, baseKey) as unknown as ISlcDeltaOp;
        const filePriority = classifyAssetPriority({
          fileName: file.filename,
          mimeType: file.content_type,
          fileSize: file.size,
          postedAt: file.created_at,
          displayName: file.display_name,
        });
        const inScope =
          priorityFilter === 'all' ||
          (priorityFilter === 'critical_high_only' &&
            (filePriority === 'critical' || filePriority === 'high')) ||
          (priorityFilter === 'medium_low_only' &&
            (filePriority === 'medium' || filePriority === 'low'));

        if (downloader && inScope) {
          const externalId = `canvas-file-${file.id}`;
          const serverUrl = await this._maybeDownloadAsset(
            file,
            externalId,
            course.id,
            downloader,
            syncState,
            downloadHeaders
          );
          if (serverUrl && op.record) {
            op = {
              ...op,
              record: {
                ...op.record,
                url: serverUrl,
                linkAccessibility: 'public',
              },
            } as unknown as ISlcDeltaOp;
          }
        }
        ops.push(op);
      }
      for (const page of pages) {
        ops.push(transformPageToOp(page, course.id, baseKey) as unknown as ISlcDeltaOp);
      }
    }

    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    const futureStr =
      new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString().split('T')[0] ?? '';
    const calendarEvents = await client.getCalendarEvents(todayStr, futureStr);

    for (const event of calendarEvents) {
      ops.push(transformCalendarEventToOp(event, baseKey) as unknown as ISlcDeltaOp);
    }

    return ops;
  }

  private async _maybeDownloadAsset(
    file: ICanvasFile,
    externalId: string,
    courseId: string,
    downloader: IAssetDownloader,
    syncState: ISyncState | undefined,
    downloadHeaders: Record<string, string>
  ): Promise<string | null> {
    let serverUrl: string | null = null;
    const entry = syncState?.get(externalId);
    const cached = entry && entry.lastModified === file.updated_at && entry.fileSize === file.size;
    if (cached) {
      const check = await downloader.checkOnly(entry.contentHash);
      if (check.exists && check.serverUrl) serverUrl = check.serverUrl;
    }
    if (!serverUrl) {
      const result = await downloader.downloadAndUpload({
        url: file.url,
        fileName: file.filename,
        mimeType: file.content_type,
        entityType: 'courseMaterial',
        entityExternalId: externalId,
        courseExternalId: `canvas-course-${courseId}`,
        downloadHeaders,
      });
      const uploaded = result;
      if (uploaded) {
        serverUrl = uploaded.serverUrl;
        if (uploaded.contentHash) {
          syncState?.set(externalId, {
            externalId,
            contentHash: uploaded.contentHash,
            lastModified: file.updated_at,
            fileSize: file.size,
          });
        }
      }
    }
    return serverUrl;
  }
}
