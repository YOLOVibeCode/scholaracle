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
import { SkywardClient } from './skyward-client';
import {
  transformLineItemToOp,
  transformClassToOp,
  transformGradeSnapshotToOp,
} from './skyward-transformer';

/**
 * Skyward Qmlativ adapter.
 * Implements ILmsAdapter by fetching data from the Skyward OneRoster-compatible API
 * and transforming it into ISlcIngestEnvelopeV1.
 */
export class SkywardAdapter implements ILmsAdapterWithTest {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'skyward-qmlativ',
    adapterId: 'com.skyward.qmlativ',
    adapterVersion: '0.1.0',
    displayName: 'Skyward Qmlativ',
  };

  private _client: SkywardClient | undefined;
  private _isAuthenticated = false;

  public async authenticate(credentials: ILmsCredentials): Promise<void> {
    if (!credentials.accessToken) {
      throw new Error('Skyward adapter requires an accessToken (OAuth2)');
    }
    if (!credentials.baseUrl) {
      throw new Error('Skyward adapter requires a baseUrl');
    }
    this._client = new SkywardClient({
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
      const classes = await this._client.getClasses();
      return {
        success: true,
        message: `Connected — found ${classes.length} class${classes.length !== 1 ? 'es' : ''}`,
        durationMs: Date.now() - start,
        details: { courseCount: classes.length },
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
      institutionExternalId: 'skyward-instance',
    };

    const classes = await client.getClasses();

    for (const cls of classes) {
      ops.push(transformClassToOp(cls, baseKey) as unknown as ISlcDeltaOp);

      const [lineItems, results] = await Promise.all([
        client.getLineItems(cls.sourcedId),
        client.getResults(cls.sourcedId),
      ]);

      const resultsByLineItem = new Map(results.map((r) => [r.lineItem.sourcedId, r]));

      let totalEarned = 0;
      let totalPossible = 0;

      for (const lineItem of lineItems) {
        const result = resultsByLineItem.get(lineItem.sourcedId);
        ops.push(transformLineItemToOp(lineItem, result, baseKey) as unknown as ISlcDeltaOp);

        if (result?.score !== undefined && lineItem.resultValueMax) {
          totalEarned += result.score;
          totalPossible += lineItem.resultValueMax;
        }
      }

      if (totalPossible > 0) {
        ops.push(
          transformGradeSnapshotToOp(
            cls.sourcedId,
            totalEarned,
            totalPossible,
            baseKey
          ) as unknown as ISlcDeltaOp
        );
      }
    }

    return ops;
  }
}
