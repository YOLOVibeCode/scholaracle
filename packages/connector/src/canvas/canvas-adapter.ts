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
import { CanvasClient } from './canvas-client';
import {
  transformAssignmentToOp,
  transformCourseToOp,
  transformGradeSnapshotToOp,
} from './canvas-transformer';

/**
 * Canvas LMS adapter.
 * Implements ILmsAdapter by fetching data from the Canvas REST API
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
      throw new Error('Canvas adapter requires an accessToken (Bearer token)');
    }
    if (!credentials.baseUrl) {
      throw new Error('Canvas adapter requires a baseUrl (e.g. https://myschool.instructure.com)');
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
      const courses = await this._client.getCourses();
      return {
        success: true,
        message: `Connected — found ${courses.length} course${courses.length !== 1 ? 's' : ''}`,
        durationMs: Date.now() - start,
        details: { courseCount: courses.length },
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
      ops.push(transformCourseToOp(course, baseKey) as unknown as ISlcDeltaOp);

      // Fetch assignments and enrollments concurrently (independent data)
      const [assignments, enrollments] = await Promise.all([
        client.getAssignments(course.id),
        client.getEnrollments(course.id),
      ]);

      for (const assignment of assignments) {
        if (assignment.workflow_state !== 'published') continue;

        const submission = await client.getMySubmission(course.id, assignment.id);
        ops.push(
          transformAssignmentToOp(assignment, submission, baseKey) as unknown as ISlcDeltaOp
        );
      }

      const myEnrollment = enrollments[0];
      if (myEnrollment?.grades?.current_score !== undefined) {
        ops.push(
          transformGradeSnapshotToOp(course.id, myEnrollment, baseKey) as unknown as ISlcDeltaOp
        );
      }
    }

    return ops;
  }
}
