/**
 * Types for the scraper bundle flow: multiple platform connections
 * collected into one script download.
 */

export interface IBundleConnection {
  readonly id: string;
  readonly platformId: string;
  readonly platformName: string;
  readonly loginUrl: string;
  /** Optional hint when the portal only shows one student's data. */
  readonly studentNameHint?: string;
  readonly scraperId: string | null;
  readonly generationStatus: 'ready' | 'generating' | 'failed';
  readonly jobId: string | null;
}

export interface IBundleConnectionPayload {
  readonly platformId: string;
  readonly platformName: string;
  readonly loginUrl: string;
  readonly scraperId: string | null;
  readonly credentials: {
    readonly studentNameHint?: string;
  };
}
