import type { IGeneratedScraper } from './ai-generator';

export interface IValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates AI-generated scraper code has the required patterns.
 * Does NOT compile TypeScript (that would need a full ts-node setup).
 * Instead checks for structural patterns that ensure the code is usable.
 */
export function validateGeneratedScraper(scraper: IGeneratedScraper): IValidationResult {
  const errors: string[] = [];

  // Check scraper code
  if (!scraper.scraperCode || scraper.scraperCode.trim().length < 100) {
    errors.push('Scraper code is missing or too short');
  } else {
    if (!scraper.scraperCode.includes('authenticate')) {
      errors.push('Scraper must have an authenticate method');
    }
    if (!scraper.scraperCode.includes('scrape')) {
      errors.push('Scraper must have a scrape method');
    }
    if (!scraper.scraperCode.includes('chromium') && !scraper.scraperCode.includes('playwright')) {
      errors.push('Scraper must use Playwright for browser automation');
    }
    if (!scraper.scraperCode.includes('cleanup') && !scraper.scraperCode.includes('close')) {
      errors.push('Scraper must have cleanup/close logic');
    }
  }

  // Check transformer code
  if (!scraper.transformerCode || scraper.transformerCode.trim().length < 50) {
    errors.push('Transformer code is missing or too short');
  } else {
    if (
      !scraper.transformerCode.includes('ISlcDeltaOp') &&
      !scraper.transformerCode.includes('DeltaOp')
    ) {
      errors.push('Transformer must produce ISlcDeltaOp operations');
    }
    if (!scraper.transformerCode.includes('upsert')) {
      errors.push('Transformer must produce upsert operations');
    }
  }

  // Check metadata
  if (!scraper.metadata || scraper.metadata.trim().length < 10) {
    errors.push('Metadata JSON is missing');
  } else {
    try {
      const meta = JSON.parse(scraper.metadata);
      if (!meta.id) errors.push('Metadata must have an id');
      if (!meta.name) errors.push('Metadata must have a name');
    } catch {
      errors.push('Metadata is not valid JSON');
    }
  }

  return { valid: errors.length === 0, errors };
}
