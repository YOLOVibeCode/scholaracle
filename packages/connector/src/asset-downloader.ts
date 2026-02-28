import { createHash } from 'node:crypto';

/** Config for AssetDownloader: API base URL, connector JWT, source and provider. */
export interface IAssetDownloaderConfig {
  readonly apiBaseUrl: string;
  readonly connectorToken: string;
  readonly sourceId: string;
  readonly provider: string;
  /** Max file size in bytes. Default 50MB; set from MAX_ASSET_DOWNLOAD_SIZE (bytes) when constructing in worker. */
  readonly maxSizeBytes?: number;
  /** Timeout per file download in ms (default 30_000). */
  readonly timeoutMs?: number;
}

export interface IAssetDownloadParams {
  readonly url: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly entityType: string;
  readonly entityExternalId: string;
  readonly courseExternalId?: string;
  /** Optional headers for the download request (e.g. Canvas/GC auth). */
  readonly downloadHeaders?: Record<string, string>;
}

export interface IAssetDownloadResult {
  readonly assetId: string;
  readonly serverUrl: string;
  /** Set when a new upload was performed; use for SyncState. */
  readonly contentHash?: string;
}

export interface IAssetCheckResult {
  readonly exists: boolean;
  readonly assetId?: string;
  readonly serverUrl?: string;
}

/** Default 50MB; override via config.maxSizeBytes or MAX_ASSET_DOWNLOAD_SIZE env in worker. */
export const DEFAULT_MAX_ASSET_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_MAX_BYTES = DEFAULT_MAX_ASSET_DOWNLOAD_BYTES;
const DEFAULT_TIMEOUT_MS = 30_000;
const TEN_MB = 10 * 1024 * 1024;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export type AssetPriority = 'critical' | 'high' | 'medium' | 'low';

const PRIORITY_ORDER: Record<AssetPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Compare priorities for sort (lower index = higher priority). */
export function compareAssetPriority(a: AssetPriority, b: AssetPriority): number {
  return PRIORITY_ORDER[a] - PRIORITY_ORDER[b];
}

/**
 * Classify asset by type and recency for download order.
 * critical: syllabus, rubric; high: last 7 days; medium: older, <10MB; low: large, video, archive.
 */
export function classifyAssetPriority(params: {
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly fileSize?: number;
  readonly postedAt?: string;
  readonly displayName?: string;
}): AssetPriority {
  const name = ((params.fileName ?? '') + (params.displayName ?? '')).toLowerCase();
  if (/syllabus|rubric/i.test(name)) return 'critical';

  const postedAt = params.postedAt ? new Date(params.postedAt).getTime() : 0;
  const now = Date.now();
  if (postedAt && now - postedAt < SEVEN_DAYS_MS) return 'high';

  const mime = (params.mimeType ?? '').toLowerCase();
  const size = params.fileSize ?? 0;
  if (mime.includes('video') || /\.(zip|tar|rar|7z)$/i.test(name) || size > TEN_MB) return 'low';
  return 'medium';
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Downloads files from source URLs, deduplicates by content hash via check API,
 * and uploads to the ingest asset store when not already present.
 */
export class AssetDownloader {
  private readonly _config: IAssetDownloaderConfig;

  constructor(config: IAssetDownloaderConfig) {
    this._config = config;
  }

  /** Check whether an asset with the given content hash already exists (no download). */
  async checkOnly(contentHash: string): Promise<IAssetCheckResult> {
    const base = this._config.apiBaseUrl.replace(/\/$/, '');
    const url = new URL(`${base}/api/ingest/v1/assets/check`);
    url.searchParams.set('sourceId', this._config.sourceId);
    url.searchParams.set('contentHash', contentHash);

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { authorization: `Bearer ${this._config.connectorToken}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Asset check failed: HTTP ${res.status} ${res.statusText}: ${text}`);
    }

    const data = (await res.json()) as { exists: boolean; assetId?: string; serverUrl?: string };
    return {
      exists: data.exists === true,
      assetId: data.assetId,
      serverUrl: data.serverUrl,
    };
  }

  /**
   * Download file from url, compute hash, check dedup, upload if missing.
   * Returns { assetId, serverUrl } or null if skipped (e.g. size limit).
   */
  // eslint-disable-next-line complexity
  async downloadAndUpload(params: IAssetDownloadParams): Promise<IAssetDownloadResult | null> {
    const maxBytes = this._config.maxSizeBytes ?? DEFAULT_MAX_BYTES;
    const timeoutMs = this._config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(params.url, {
        method: 'GET',
        headers: params.downloadHeaders ?? {},
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return null;
      }

      const contentLength = res.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (!Number.isNaN(size) && size > maxBytes) {
          return null;
        }
      }

      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > maxBytes) {
        return null;
      }

      const contentHash = sha256Hex(buffer);
      const check = await this.checkOnly(contentHash);
      if (check.exists && check.assetId && check.serverUrl) {
        return { assetId: check.assetId, serverUrl: check.serverUrl, contentHash };
      }

      const base = this._config.apiBaseUrl.replace(/\/$/, '');
      const uploadUrl = `${base}/api/ingest/v1/assets/upload`;
      const form = new FormData();
      form.append('file', new Blob([buffer]), params.fileName);
      form.append('sourceId', this._config.sourceId);
      form.append('provider', this._config.provider);
      form.append('originalUrl', params.url);
      form.append('contentHash', contentHash);
      form.append('fileName', params.fileName);
      form.append('entityType', params.entityType);
      form.append('entityExternalId', params.entityExternalId);
      if (params.courseExternalId) form.append('courseExternalId', params.courseExternalId);

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: { authorization: `Bearer ${this._config.connectorToken}` },
        body: form,
      });

      if (!uploadRes.ok) {
        const text = await uploadRes.text();
        throw new Error(`Asset upload failed: HTTP ${uploadRes.status}: ${text}`);
      }

      const result = (await uploadRes.json()) as { assetId: string; serverUrl: string };
      return {
        assetId: result.assetId,
        serverUrl: result.serverUrl,
        contentHash,
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }
      throw err;
    }
  }
}
