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
import { GoogleClassroomClient } from './google-classroom-client';
import { probeLinkAccessibilityBatch } from '../link-probe';
import {
  transformCourseWorkToOp,
  transformCourseToOp,
  transformGradeSnapshotToOp,
  transformMaterialToOps,
} from './google-classroom-transformer';

/**
 * Google Classroom adapter.
 * Implements ILmsAdapter by fetching data from the Google Classroom REST API
 * and transforming it into ISlcIngestEnvelopeV1.
 */
export class GoogleClassroomAdapter implements ILmsAdapterWithTest {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'google-classroom',
    adapterId: 'com.google.classroom',
    adapterVersion: '0.1.0',
    displayName: 'Google Classroom',
  };

  private _client: GoogleClassroomClient | undefined;
  private _isAuthenticated = false;

  public async authenticate(credentials: ILmsCredentials): Promise<void> {
    if (!credentials.accessToken) {
      throw new Error('Google Classroom adapter requires an accessToken (OAuth2)');
    }
    this._client = new GoogleClassroomClient({
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
      institutionExternalId: 'google-classroom-instance',
    };

    const courses = await client.getCourses();

    for (const course of courses) {
      ops.push(transformCourseToOp(course, baseKey) as unknown as ISlcDeltaOp);

      const courseWork = await client.getCourseWork(course.id);
      let totalEarned = 0;
      let totalPossible = 0;

      for (const cw of courseWork) {
        const submissions = await client.getStudentSubmissions(course.id, cw.id);
        const submission = submissions[0];
        ops.push(transformCourseWorkToOp(cw, submission, baseKey) as unknown as ISlcDeltaOp);

        if (submission?.assignedGrade !== undefined && cw.maxPoints) {
          totalEarned += submission.assignedGrade;
          totalPossible += cw.maxPoints;
        }
      }

      try {
        const materials = await client.getCourseWorkMaterials(course.id);
        for (const material of materials) {
          for (const op of transformMaterialToOps(material, baseKey)) {
            ops.push(op as unknown as ISlcDeltaOp);
          }
        }
      } catch {
        // Skip materials for this course without aborting the sync.
      }

      if (totalPossible > 0) {
        ops.push(
          transformGradeSnapshotToOp(
            course.id,
            totalEarned,
            totalPossible,
            baseKey
          ) as unknown as ISlcDeltaOp
        );
      }
    }

    // Probe link-type course materials for accessibility (batch concurrency 5).
    const linkOps = ops.filter(
      (o) =>
        o.entity === 'courseMaterial' &&
        (o.record as { type?: string; url?: string } | undefined)?.type === 'link' &&
        (o.record as { url?: string })?.url
    );
    if (linkOps.length > 0) {
      const urls = linkOps.map((o) => (o.record as { url: string }).url) as readonly string[];
      const accessibilityByUrl = await probeLinkAccessibilityBatch(urls, 5);
      for (const op of linkOps) {
        const url = (op.record as { url: string }).url;
        const acc = accessibilityByUrl.get(url) ?? 'unknown';
        (op as { record: Record<string, unknown> }).record = {
          ...(op.record as Record<string, unknown>),
          linkAccessibility: acc,
        };
      }
    }

    return ops;
  }
}
