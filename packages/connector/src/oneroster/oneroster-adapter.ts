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
import { OneRosterClient } from './oneroster-client';
import {
  transformLineItemToOp,
  transformCourseToOp,
  transformAcademicSessionToOp,
  transformOrgToOp,
} from './oneroster-transformer';

/**
 * OneRoster generic adapter.
 * Works with any SIS/LMS that exposes a OneRoster v1.1/v1.2 endpoint:
 * Infinite Campus, Skyward Qmlativ, Blackbaud, FACTS, Aeries, etc.
 *
 * Implements ILmsAdapter by fetching data from standard OneRoster endpoints
 * and transforming it into ISlcIngestEnvelopeV1.
 */
export class OneRosterAdapter implements ILmsAdapterWithTest {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'oneroster',
    adapterId: 'org.imsglobal.oneroster.1.2',
    adapterVersion: '0.1.0',
    displayName: 'OneRoster 1.2 (Generic)',
  };

  private _client: OneRosterClient | undefined;
  private _isAuthenticated = false;

  public async authenticate(credentials: ILmsCredentials): Promise<void> {
    if (!credentials.baseUrl) {
      throw new Error('OneRoster adapter requires baseUrl');
    }

    if (credentials.accessToken) {
      this._client = new OneRosterClient({
        baseUrl: credentials.baseUrl,
        accessToken: credentials.accessToken,
      });
    } else if (credentials.clientId && credentials.clientSecret) {
      const tokenUrl = `${credentials.baseUrl}/token`;
      this._client = await OneRosterClient.fromClientCredentials(
        tokenUrl,
        credentials.clientId,
        credentials.clientSecret,
        credentials.baseUrl
      );
    } else {
      throw new Error('OneRoster adapter requires either accessToken or clientId + clientSecret');
    }

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
      const [orgs, courses] = await Promise.all([
        this._client.getOrgs(),
        this._client.getCourses(),
      ]);
      const orgName = orgs[0]?.name;
      return {
        success: true,
        message: `Connected${orgName ? ` to ${orgName}` : ''} — found ${courses.length} course${courses.length !== 1 ? 's' : ''}`,
        durationMs: Date.now() - start,
        details: { courseCount: courses.length, institutionName: orgName },
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
      institutionExternalId: 'oneroster-instance',
    };

    const [orgs, sessions, courses, lineItems, results] = await Promise.all([
      client.getOrgs(),
      client.getAcademicSessions(),
      client.getCourses(),
      client.getLineItems(),
      client.getResults(),
    ]);

    for (const org of orgs) {
      ops.push(transformOrgToOp(org, baseKey) as unknown as ISlcDeltaOp);
    }

    for (const session of sessions) {
      ops.push(transformAcademicSessionToOp(session, baseKey) as unknown as ISlcDeltaOp);
    }

    for (const course of courses) {
      ops.push(transformCourseToOp(course, baseKey) as unknown as ISlcDeltaOp);
    }

    const resultsByLineItem = new Map<string, (typeof results)[number]>();
    for (const r of results) {
      resultsByLineItem.set(r.lineItem.sourcedId, r);
    }

    for (const li of lineItems) {
      const result = resultsByLineItem.get(li.sourcedId);
      ops.push(transformLineItemToOp(li, result, baseKey) as unknown as ISlcDeltaOp);
    }

    return ops;
  }
}
