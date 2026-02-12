import {
  SLC_INGEST_SCHEMA_VERSION_V1,
  type ISlcIngestEnvelopeV1,
  type ISlcDeltaOp,
} from '@scholaracle/contracts';
import type {
  ILmsAdapter,
  ILmsAdapterMeta,
  ILmsCredentials,
  IFetchEnvelopeParams,
} from '../adapter';
import { CanvasClient } from './canvas-client';
import { transformAssignmentToOp, transformCalendarEventToOp } from './canvas-transformer';

/**
 * Canvas LMS adapter scaffold.
 * Implements ILmsAdapter by fetching data from Canvas REST API
 * and transforming it into ISlcIngestEnvelopeV1.
 */
export class CanvasAdapter implements ILmsAdapter {
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

    const baseKey = {
      provider: this.meta.provider,
      adapterId: this.meta.adapterId,
      studentExternalId: 'self',
      institutionExternalId: 'canvas-instance',
    };

    const courses = await client.getCourses();

    for (const course of courses) {
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
}
