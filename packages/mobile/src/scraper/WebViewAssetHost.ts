/**
 * WebViewAssetHost — IAssetHost implementation for the mobile sync pipeline.
 *
 * During a sync run the school portal is loaded in a WebView with the user's
 * active session cookies. This host uses driver.evaluate() to fetch portal
 * file URLs inside that authenticated context, converts the response body to
 * base64, and re-uploads it to the Scholaracle asset store via the connector
 * token. The op's record.url is rewritten to the permanent server URL so the
 * work pack can open files without needing the school portal session.
 *
 * Design notes:
 * - Fail-open: errors on individual files are swallowed; the sync always
 *   succeeds even if asset rehosting is partial.
 * - Size gate: files larger than MAX_FILE_BYTES are skipped to protect
 *   device memory during the base64 round-trip.
 * - Deduplication: the server checks contentHash before storing, so
 *   re-syncing the same file does not cost another upload.
 * - The base64 upload endpoint (/api/ingest/v1/assets/upload-base64) accepts
 *   JSON rather than multipart, avoiding the need for expo-file-system.
 */

import { classifyResource, type IAssetHost } from '@scholaracle/scraper-core';
import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { IPageDriver } from '@scholaracle/scraper-core';

/** 20 MB — stop trying to rehost a file larger than this. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Milliseconds before we give up on a single file fetch inside the WebView. */
const FETCH_TIMEOUT_MS = 30_000;

export interface IWebViewAssetHostConfig {
  /** Authenticated page driver from the current sync (with portal cookies). */
  readonly driver: IPageDriver;
  /** Connector JWT issued at the start of the sync run. */
  readonly connectorToken: string;
  /** Source identifier used as the asset namespace. */
  readonly sourceId: string;
  /** LMS provider string, e.g. 'canvas'. */
  readonly provider: string;
  /** Portal origin to filter portal URLs, e.g. 'https://school.instructure.com'. */
  readonly portalOrigin: string;
  /** Scholaracle API base URL, e.g. 'https://api.scholarmancy.com'. */
  readonly apiBaseUrl: string;
}

/** Shape of the data returned from the in-WebView fetch. */
interface IFetchedAsset {
  readonly base64: string;
  readonly mimeType: string;
  readonly size: number;
  /** SHA-256 hex digest of the file bytes, computed in the WebView via SubtleCrypto. */
  readonly sha256: string;
  readonly fileName: string;
}

/**
 * Fetch a file from within the WebView's authenticated session.
 * This function runs as a string-serialised script inside the page context —
 * it MUST be self-contained (no closure references).
 */
async function fetchAssetInWebView(
  url: string,
  maxBytes: number,
  timeoutMs: number
): Promise<IFetchedAsset | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { credentials: 'include', signal: controller.signal });
    clearTimeout(tid);
    if (!resp.ok) return null;

    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength > maxBytes) return null;

    const bytes = new Uint8Array(buffer);

    // Build base64 manually — btoa() chokes on non-Latin1 bytes.
    const CHUNK = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...Array.from(bytes.slice(i, i + CHUNK)));
    }
    const base64 = btoa(binary);

    // Compute SHA-256 via SubtleCrypto.
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Derive fileName from URL path.
    const pathName = new URL(url).pathname;
    const segments = pathName.split('/').filter(Boolean);
    const raw = segments[segments.length - 1] ?? 'file';
    const fileName = decodeURIComponent(raw);

    return {
      base64,
      mimeType: resp.headers.get('content-type') ?? 'application/octet-stream',
      size: bytes.length,
      sha256,
      fileName,
    };
  } catch {
    return null;
  }
}

export class WebViewAssetHost implements IAssetHost {
  private readonly _config: IWebViewAssetHostConfig;

  constructor(config: IWebViewAssetHostConfig) {
    this._config = config;
  }

  async processOps(ops: ISlcDeltaOp[]): Promise<ISlcDeltaOp[]> {
    const { driver, connectorToken, sourceId, provider, apiBaseUrl } = this._config;
    const uploadUrl = `${apiBaseUrl.replace(/\/$/, '')}/api/ingest/v1/assets/upload-base64`;

    const result: ISlcDeltaOp[] = [];
    for (const op of ops) {
      if (op.op === 'delete') {
        result.push(op);
        continue;
      }

      const record = op.record as Record<string, unknown> | undefined;

      if (op.entity === 'courseMaterial') {
        result.push(
          await this._processMaterialOp(
            op,
            record,
            uploadUrl,
            driver,
            connectorToken,
            sourceId,
            provider
          )
        );
        continue;
      }

      if (op.entity === 'assignment') {
        result.push(
          await this._processAssignmentOp(
            op,
            record,
            uploadUrl,
            driver,
            connectorToken,
            sourceId,
            provider
          )
        );
        continue;
      }

      result.push(op);
    }
    return result;
  }

  /**
   * Process a single courseMaterial op: classify its URL, rehost if warranted.
   */
  private async _processMaterialOp(
    op: ISlcDeltaOp,
    record: Record<string, unknown> | undefined,
    uploadUrl: string,
    driver: IPageDriver,
    connectorToken: string,
    sourceId: string,
    provider: string
  ): Promise<ISlcDeltaOp> {
    const fileUrl = record?.['url'] as string | undefined;
    const type = record?.['type'] as string | undefined;
    if (!fileUrl) return op;

    const action = classifyResource({ url: fileUrl, type });

    if (action === 'leaveLink') {
      return {
        ...op,
        record: { ...record, linkAccessibility: 'authenticated' },
      };
    }

    if (action === 'extractText') {
      // Text extraction happens in the scraper recipe; here we just mark accessibility.
      return {
        ...op,
        record: { ...record, linkAccessibility: 'public' },
      };
    }

    // action === 'rehost'
    const entityExternalId = op.key?.externalId as string | undefined;
    const courseExternalId = record?.['courseExternalId'] as string | undefined;
    if (!entityExternalId) return op;

    return this._rehostUrl({
      op,
      record,
      fileUrl,
      uploadUrl,
      driver,
      connectorToken,
      sourceId,
      provider,
      entityType: 'courseMaterial',
      entityExternalId,
      courseExternalId: courseExternalId ?? '',
    });
  }

  /**
   * Process a single assignment op: rehost each item in attachments[].
   */
  private async _processAssignmentOp(
    op: ISlcDeltaOp,
    record: Record<string, unknown> | undefined,
    uploadUrl: string,
    driver: IPageDriver,
    connectorToken: string,
    sourceId: string,
    provider: string
  ): Promise<ISlcDeltaOp> {
    const attachments = record?.['attachments'];
    if (!Array.isArray(attachments) || attachments.length === 0) return op;

    const entityExternalId = op.key?.externalId as string | undefined;
    const courseExternalId = record?.['courseExternalId'] as string | undefined;
    if (!entityExternalId) return op;

    const rewritten: unknown[] = [];
    let changed = false;

    for (const att of attachments) {
      if (typeof att !== 'object' || att === null) {
        rewritten.push(att);
        continue;
      }
      const attRec = att as Record<string, unknown>;
      const fileUrl = attRec['url'] as string | undefined;
      if (!fileUrl) {
        rewritten.push(att);
        continue;
      }

      const action = classifyResource({ url: fileUrl, type: 'document' });
      if (action !== 'rehost') {
        rewritten.push(att);
        continue;
      }

      try {
        const asset = await driver.evaluate(
          fetchAssetInWebView,
          fileUrl,
          MAX_FILE_BYTES,
          FETCH_TIMEOUT_MS
        );
        if (!asset) {
          rewritten.push(att);
          continue;
        }

        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${connectorToken}`,
          },
          body: JSON.stringify({
            data: asset.base64,
            sourceId,
            provider,
            originalUrl: fileUrl,
            contentHash: asset.sha256,
            fileName: asset.fileName,
            mimeType: asset.mimeType,
            entityType: 'assignment',
            entityExternalId,
            courseExternalId: courseExternalId ?? '',
          }),
        });

        if (!uploadRes.ok) {
          rewritten.push(att);
          continue;
        }

        const { serverUrl } = (await uploadRes.json()) as { serverUrl?: string };
        if (!serverUrl) {
          rewritten.push(att);
          continue;
        }

        rewritten.push({ ...attRec, url: serverUrl });
        changed = true;
      } catch {
        rewritten.push(att);
      }
    }

    if (!changed) return op;
    return { ...op, record: { ...record, attachments: rewritten } };
  }

  private async _rehostUrl(params: {
    op: ISlcDeltaOp;
    record: Record<string, unknown> | undefined;
    fileUrl: string;
    uploadUrl: string;
    driver: IPageDriver;
    connectorToken: string;
    sourceId: string;
    provider: string;
    entityType: string;
    entityExternalId: string;
    courseExternalId: string;
  }): Promise<ISlcDeltaOp> {
    const {
      op,
      record,
      fileUrl,
      uploadUrl,
      driver,
      connectorToken,
      sourceId,
      provider,
      entityType,
      entityExternalId,
      courseExternalId,
    } = params;

    try {
      const asset = await driver.evaluate(
        fetchAssetInWebView,
        fileUrl,
        MAX_FILE_BYTES,
        FETCH_TIMEOUT_MS
      );
      if (!asset) return op;

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${connectorToken}`,
        },
        body: JSON.stringify({
          data: asset.base64,
          sourceId,
          provider,
          originalUrl: fileUrl,
          contentHash: asset.sha256,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          entityType,
          entityExternalId,
          courseExternalId,
        }),
      });

      if (!uploadRes.ok) return op;

      const { serverUrl } = (await uploadRes.json()) as { serverUrl?: string };
      if (!serverUrl) return op;

      return { ...op, record: { ...record, url: serverUrl } };
    } catch {
      return op;
    }
  }
}
