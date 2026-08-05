/**
 * Parent Square — community scraper module (IScraperModule).
 *
 * 1. Implement scrape() with host.driver (WebView / extension / FakePageDriver)
 * 2. Map raw → ops in transform.ts
 * 3. Update fixtures/sample.json and run: pnpm test -- parent-square
 * 4. Sideload via Helper when ready
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { ITransformContext } from '../../types';
import { parseScraperManifest } from '../../registry/manifest';
import type { IScraperHost, IScraperModule } from '../../registry/module';
import { transformParentSquareExtract, type IParentSquareExtract } from './transform';

const metadata = parseScraperManifest(
  JSON.parse(readFileSync(join(__dirname, 'manifest.json'), 'utf8'))
);

export const parentSquareModule: IScraperModule = {
  metadata,
  async scrape(host: IScraperHost): Promise<Record<string, unknown>> {
    host.progress({
      phase: 'scraping',
      message: 'Scraping Parent Square',
      timestamp: new Date().toISOString(),
    });

    await host.driver.goto(host.config.baseUrl);
    await host.driver.waitForLoad({ timeout: 15000 }).catch(() => undefined);

    // TODO: login + navigate + evaluate selectors for your portal
    const extract: IParentSquareExtract = {
      studentName: host.config.studentNameHint ?? 'Unknown Student',
      courses: [],
      scrapedAt: new Date().toISOString(),
    };
    return extract as unknown as Record<string, unknown>;
  },
  transform(raw: Record<string, unknown>, ctx: ITransformContext): ISlcDeltaOp[] {
    return transformParentSquareExtract(raw as unknown as IParentSquareExtract, ctx);
  },
};
