/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * Skyward browser adapter — implements ILmsAdapterWithTest using SkywardBrowserScraper + transformer.
 */

import { SLC_INGEST_SCHEMA_VERSION_V1, type ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import type {
  ILmsAdapterWithTest,
  ILmsAdapterMeta,
  ILmsCredentials,
  IFetchEnvelopeParams,
  IConnectionTestResult,
} from '../adapter';
import type { IStrategyStore } from '../strategy';
import type { IAiClient } from './ai-client-interface';
import { SkywardBrowserScraper } from './skyward-browser-scraper';
import { transformSkywardExtract, type TransformContext } from './skyward-browser-transformer';

export type SkywardBrowserScraperFactory = () => SkywardBrowserScraper;

export class SkywardBrowserAdapter implements ILmsAdapterWithTest {
  public readonly meta: ILmsAdapterMeta = {
    provider: 'skyward',
    adapterId: 'com.skyward.browser',
    adapterVersion: '1.0.0',
    displayName: 'Skyward (Browser)',
  };

  private _scraper: SkywardBrowserScraper | undefined;
  private _isAuthenticated = false;
  private readonly _scraperFactory: SkywardBrowserScraperFactory;
  private readonly _aiClient: IAiClient | undefined;
  private readonly _strategyStore: IStrategyStore | undefined;

  constructor(
    scraperFactory?: SkywardBrowserScraperFactory,
    aiClient?: IAiClient,
    strategyStore?: IStrategyStore
  ) {
    this._scraperFactory = scraperFactory ?? (() => new SkywardBrowserScraper());
    this._aiClient = aiClient;
    this._strategyStore = strategyStore;
  }

  public async authenticate(credentials: ILmsCredentials): Promise<void> {
    if (!credentials.username || !credentials.password) {
      throw new Error('Skyward browser adapter requires username and password');
    }
    if (!credentials.baseUrl) {
      throw new Error('Skyward browser adapter requires baseUrl');
    }

    const scraper = this._scraperFactory();
    await scraper.launch({
      headless: true,
      aiClient: this._aiClient,
      strategyStore: this._strategyStore,
    });
    try {
      const result = await scraper.authenticate(
        credentials.baseUrl,
        credentials.username,
        credentials.password,
        credentials.loginMethod // Pass through loginMethod from credentials
      );
      if (!result.success) {
        await scraper.close();
        throw new Error(result.message ?? 'Authentication failed');
      }
      this._scraper = scraper;
      this._isAuthenticated = true;
    } catch (err) {
      await scraper.close();
      throw err;
    }
  }

  public isAuthenticated(): boolean {
    return this._isAuthenticated;
  }

  public async testConnection(): Promise<IConnectionTestResult> {
    const start = Date.now();
    if (!this._scraper) {
      return {
        success: false,
        message: 'Not authenticated. Call authenticate() first.',
        durationMs: Date.now() - start,
      };
    }
    try {
      const extract = await this._scraper.extractAll();
      const courseCount = extract.courses.length;
      return {
        success: true,
        message: `Connected — found ${courseCount} course${courseCount !== 1 ? 's' : ''}`,
        durationMs: Date.now() - start,
        details: { courseCount },
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
    if (!this._scraper) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    try {
      const extract = await this._scraper.extractAll();
      const ctx: TransformContext = {
        provider: this.meta.provider,
        adapterId: this.meta.adapterId,
        studentExternalId: 'self',
        institutionExternalId: params.sourceId ?? 'skyward-instance',
      };
      const ops = transformSkywardExtract(extract, ctx);

      return {
        schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
        run: {
          runId: params.runId,
          startedAt: new Date().toISOString(),
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
    } finally {
      await this._scraper.close();
      this._scraper = undefined;
      this._isAuthenticated = false;
    }
  }
}
