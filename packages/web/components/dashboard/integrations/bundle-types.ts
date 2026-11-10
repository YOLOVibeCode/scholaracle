/**
 * Types for multi-platform connect flow: connections added during onboarding
 * or integrations are completed on the phone (no server-side download).
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
