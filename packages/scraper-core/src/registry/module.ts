/**
 * Scraper module / host contracts (ISP).
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { IPageDriver, ScraperProgressCallback } from '../driver/IPageDriver';
import type { ITransformContext } from '../types';
import type { IScraperManifest } from './manifest';

export interface IScraperRuntimeConfig {
  readonly baseUrl: string;
  readonly studentExternalId?: string;
  readonly studentNameHint?: string;
}

export interface IScraperHost {
  readonly driver: IPageDriver;
  readonly progress: ScraperProgressCallback;
  readonly config: IScraperRuntimeConfig;
}

export interface IScraperModule {
  readonly metadata: IScraperManifest;
  scrape(host: IScraperHost): Promise<Record<string, unknown>>;
  transform(raw: Record<string, unknown>, ctx: ITransformContext): ISlcDeltaOp[];
}

export interface IScraperResolveResult {
  readonly module: IScraperModule;
  readonly canRun: boolean;
  readonly checkErrors: readonly string[];
}

export interface IScraperResolver {
  resolve(adapterId: string, version?: string): Promise<IScraperResolveResult>;
}
