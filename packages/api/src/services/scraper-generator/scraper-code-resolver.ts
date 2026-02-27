/**
 * Resolves scraper code for a connection: from DB by scraperId, or reference stub for known platforms, or generic fallback.
 * ISP: Single responsibility — the packager and download handler depend only on this interface for "get code for this connection".
 */

import type { Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { isKnownPlatform } from './job-processor';

export interface IScraperCode {
  readonly scraperCode: string;
  readonly transformerCode: string;
  readonly metadata: string;
}

export interface IConnectionInput {
  readonly scraperId: string | null;
  readonly platformName: string;
  readonly loginUrl: string;
}

/**
 * Resolves scraper code for one connection.
 * - If scraperId is set: fetch from generated_scrapers collection.
 * - If scraperId is null and platformName is known (Canvas, Aeries, Skyward): return reference stub.
 * - Otherwise: return generic fallback (CSS-selector login, no real scrape).
 */
export async function resolveScraperCode(
  collection: Collection<{
    _id?: unknown;
    scraperCode?: string;
    transformerCode?: string;
    metadata?: string;
  }>,
  connection: IConnectionInput
): Promise<IScraperCode> {
  if (connection.scraperId) {
    const doc = await collection.findOne({ _id: new ObjectId(connection.scraperId) });
    if (!doc) {
      throw new Error('Scraper not found');
    }
    return {
      scraperCode: (doc.scraperCode as string) ?? '',
      transformerCode: (doc.transformerCode as string) ?? '',
      metadata: (doc.metadata as string) ?? '{}',
    };
  }
  if (isKnownPlatform(connection.platformName)) {
    return {
      scraperCode: `// Reference scraper for ${connection.platformName}\n// This uses the built-in ${connection.platformName} scraper from the Scholaracle library.`,
      transformerCode: `// Reference transformer for ${connection.platformName}`,
      metadata: JSON.stringify(
        {
          id: `${connection.platformName.toLowerCase()}-browser`,
          name: connection.platformName,
          version: '1.0.0',
          description: `Scrapes student data from ${connection.platformName}`,
        },
        null,
        2
      ),
    };
  }
  return {
    scraperCode: '// generic fallback scraper (CSS-selector login only)',
    transformerCode: '// Generic transformer',
    metadata: JSON.stringify(
      {
        id: 'generic-browser',
        name: connection.platformName,
        version: '1.0.0',
        description: 'Generic',
      },
      null,
      2
    ),
  };
}
