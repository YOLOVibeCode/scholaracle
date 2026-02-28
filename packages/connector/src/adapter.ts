import type { ISlcIngestEnvelopeV1, ISlcCursor } from '@scholaracle/contracts';

/** Minimal interface for asset dedup + upload (implemented by AssetDownloader). */
export interface IAssetDownloaderLike {
  checkOnly(
    contentHash: string
  ): Promise<{ exists: boolean; assetId?: string; serverUrl?: string }>;
  downloadAndUpload(params: {
    url: string;
    fileName: string;
    mimeType: string;
    entityType: string;
    entityExternalId: string;
    courseExternalId?: string;
    downloadHeaders?: Record<string, string>;
  }): Promise<{ assetId: string; serverUrl: string; contentHash?: string } | null>;
}

/** Minimal interface for persisted file sync state (implemented by SyncState). */
export interface ISyncStateLike {
  get(
    externalId: string
  ): { contentHash: string; lastModified: string; fileSize: number } | undefined;
  set(
    externalId: string,
    entry: { externalId: string; contentHash: string; lastModified: string; fileSize: number }
  ): void;
}

/**
 * Adapter metadata — identifies the LMS provider and adapter version.
 */
export interface ILmsAdapterMeta {
  readonly provider: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly displayName: string;
}

/**
 * Credentials for authenticating with an LMS.
 *
 * Extended to support multiple auth methods:
 * - Bearer token: baseUrl + accessToken (Canvas)
 * - OAuth 2.0: baseUrl + accessToken + refreshToken + clientId + clientSecret (Google Classroom, OneRoster)
 * - OAuth 1.0a: baseUrl + consumerKey + consumerSecret + oauthToken + oauthTokenSecret (Schoology)
 * - API key: baseUrl + apiKey (Aeries, Alma)
 * - Credentials: baseUrl + username + password (browser scraping)
 *
 * Each adapter validates the fields it requires in authenticate().
 */
export interface ILmsCredentials {
  readonly baseUrl: string;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly consumerKey?: string;
  readonly consumerSecret?: string;
  readonly oauthToken?: string;
  readonly oauthTokenSecret?: string;
  readonly apiKey?: string;
  readonly username?: string;
  readonly password?: string;
}

/**
 * Parameters for fetching an ingest envelope.
 */
export interface IFetchEnvelopeParams {
  readonly runId: string;
  readonly sourceId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
  readonly cursor?: ISlcCursor;
  /** When set, Canvas (and others) download file assets and rewrite URLs to server. */
  readonly assetDownloader?: IAssetDownloaderLike;
  /** When set with assetDownloader, enables quick-reject by updated_at + size. */
  readonly syncState?: ISyncStateLike;
  /** Headers for authenticated file downloads (e.g. Canvas Bearer token). */
  readonly assetDownloadHeaders?: Record<string, string>;
  /** For two-pass sync: only download assets in this priority band. Default 'all'. */
  readonly assetPriorityFilter?: 'all' | 'critical_high_only' | 'medium_low_only';
}

/**
 * ISP: Authentication concerns only.
 */
export interface ILmsAuthenticator {
  authenticate(credentials: ILmsCredentials): Promise<void>;
  isAuthenticated(): boolean;
}

/**
 * ISP: Data fetching concerns only.
 */
export interface ILmsEnvelopeReader {
  fetchEnvelope(params: IFetchEnvelopeParams): Promise<ISlcIngestEnvelopeV1>;
}

/**
 * Result of a connection test.
 */
export interface IConnectionTestResult {
  readonly success: boolean;
  /** Human-readable status message (e.g. "Connected — found 4 courses"). */
  readonly message: string;
  /** How long the test took in milliseconds. */
  readonly durationMs: number;
  /** Optional details about what was found (course count, user name, etc.). */
  readonly details?: {
    readonly courseCount?: number;
    readonly userName?: string;
    readonly institutionName?: string;
  };
}

/**
 * ISP: Connection testing concerns only.
 * Adapters that implement this can verify credentials are valid
 * before a full sync — gives immediate feedback to the user.
 */
export interface ILmsConnectionTester {
  testConnection(): Promise<IConnectionTestResult>;
}

/**
 * Combined adapter interface.
 */
export interface ILmsAdapter extends ILmsAuthenticator, ILmsEnvelopeReader {
  readonly meta: ILmsAdapterMeta;
}

/**
 * Adapter with connection testing capability.
 * Use a type guard: `if ('testConnection' in adapter)`.
 */
export interface ILmsAdapterWithTest extends ILmsAdapter, ILmsConnectionTester {}

/**
 * Factory function that creates an adapter given credentials.
 */
export type LmsAdapterFactory = (credentials: ILmsCredentials) => ILmsAdapter;
