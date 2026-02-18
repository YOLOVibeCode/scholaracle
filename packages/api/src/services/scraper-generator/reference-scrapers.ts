/**
 * Loads reference scraper source from the scholaracle_scrapers library so the
 * packager can embed real Canvas/Skyward/Aeries code instead of stubs.
 *
 * Resolution order: SCHOLARACLE_SCRAPERS_SRC env, then require('scholaracle-scraper').
 * If unavailable, returns null and the route falls back to comment stubs.
 */

import fs from 'fs';
import path from 'path';

export type ReferencePlatformId = 'canvas' | 'skyward' | 'aeries';

const PLATFORM_IDS: ReferencePlatformId[] = ['canvas', 'skyward', 'aeries'];

function getScrapersRoot(): string | null {
  if (process.env['SCHOLARACLE_SCRAPERS_SRC']) {
    const root = path.resolve(process.env['SCHOLARACLE_SCRAPERS_SRC']);
    if (fs.existsSync(path.join(root, 'src', 'core', 'types.ts'))) return root;
    return null;
  }
  try {
    const pkgPath = require.resolve('scholaracle-scraper/package.json', { paths: [process.cwd(), __dirname] });
    const root = path.dirname(pkgPath);
    if (fs.existsSync(path.join(root, 'src', 'core', 'types.ts'))) return root;
  } catch {
    // package not installed or no src
  }
  return null;
}

function readFileSafe(root: string, ...segments: string[]): string | null {
  const filePath = path.join(root, ...segments);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function rewriteScraperImports(code: string, platformId: string): string {
  return code
    .replace(/from ['"]\.\.\/\.\.\/core\/base-scraper['"]/g, "from './base-scraper'")
    .replace(/from ['"]\.\.\/\.\.\/core\/types['"]/g, "from './types'")
    .replace(new RegExp(`from ['"]\\./${platformId}-transformer['"]`, 'g'), "from './transformer'");
}

function rewriteTransformerImports(code: string): string {
  return code.replace(/from ['"]\.\.\/\.\.\/core\/types['"]/g, "from './types'");
}

export interface IReferenceScraperBundle {
  readonly scraperCode: string;
  readonly transformerCode: string;
  readonly baseScraperCode: string;
  readonly typesCode: string;
  readonly metadata: string;
}

/**
 * Load reference scraper source for a known platform. Returns null if the
 * scholaracle_scrapers source is not available.
 */
export function getReferenceScraper(platformId: ReferencePlatformId): IReferenceScraperBundle | null {
  const root = getScrapersRoot();
  if (!root) return null;

  const src = path.join(root, 'src');
  const typesCode = readFileSafe(src, 'core', 'types.ts');
  const baseScraperCode = readFileSafe(src, 'core', 'base-scraper.ts');
  const scraperCodeRaw = readFileSafe(src, 'scrapers', platformId, `${platformId}-scraper.ts`);
  const transformerCodeRaw = readFileSafe(src, 'scrapers', platformId, `${platformId}-transformer.ts`);
  const metadataRaw = readFileSafe(src, 'scrapers', platformId, 'metadata.json');

  if (!typesCode || !baseScraperCode || !scraperCodeRaw || !transformerCodeRaw || !metadataRaw) {
    return null;
  }

  const scraperCode = rewriteScraperImports(scraperCodeRaw, platformId);
  const transformerCode = rewriteTransformerImports(transformerCodeRaw);

  return {
    scraperCode,
    transformerCode,
    baseScraperCode,
    typesCode,
    metadata: metadataRaw,
  };
}

/**
 * Normalize platform name from API (e.g. "Canvas LMS", "Skyward") to reference id.
 */
export function normalizeToReferencePlatform(platformName: string): ReferencePlatformId | null {
  const lower = platformName.toLowerCase().trim();
  if (lower.includes('canvas')) return 'canvas';
  if (lower.includes('skyward')) return 'skyward';
  if (lower.includes('aeries')) return 'aeries';
  return null;
}

export function isReferencePlatform(platformName: string): boolean {
  const id = normalizeToReferencePlatform(platformName);
  return id !== null && PLATFORM_IDS.includes(id);
}
