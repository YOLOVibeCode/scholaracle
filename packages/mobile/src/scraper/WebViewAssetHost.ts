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
 * Capture ladder (classifyResource):
 *   rehost      — native files / binary Content-Type
 *   extractText — public HTML; store extractedText; optional snapshot PDF
 *   leaveLink   — interactive (Khan/YouTube) stays public; portal stays authenticated
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

import * as Crypto from 'expo-crypto';
import {
  buildSimplePdf,
  classifyResource,
  extractPageText,
  isInteractiveHost,
  type IAssetHost,
} from '@scholaracle/scraper-core';
import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { IPageDriver } from '@scholaracle/scraper-core';

/** 20 MB — stop trying to rehost a file larger than this. */
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Milliseconds before we give up on a single file fetch inside the WebView. */
const FETCH_TIMEOUT_MS = 30_000;

/** Article snapshot PDF is only worth storing when we grabbed a real page. */
const SNAPSHOT_MIN_CHARS = 200;

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

/** Shape of the data returned from the in-WebView file fetch. */
interface IFetchedAsset {
  readonly base64: string;
  readonly mimeType: string;
  readonly size: number;
  /** SHA-256 hex digest of the file bytes, computed in the WebView via SubtleCrypto. */
  readonly sha256: string;
  readonly fileName: string;
}

interface IFetchedHtml {
  readonly kind: 'html';
  readonly mimeType: string;
  readonly html: string;
  readonly fileName: string;
  readonly size: number;
}

interface IFetchedBinary extends IFetchedAsset {
  readonly kind: 'binary';
}

type IFetchedPage = IFetchedHtml | IFetchedBinary;

interface IUploadTarget {
  readonly uploadUrl: string;
  readonly driver: IPageDriver;
  readonly connectorToken: string;
  readonly sourceId: string;
  readonly provider: string;
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

/**
 * Fetch a public (or session) URL and return HTML or binary bytes.
 * Self-contained — runs inside the WebView.
 */
async function fetchPageInWebView(
  url: string,
  maxBytes: number,
  timeoutMs: number
): Promise<IFetchedPage | null> {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { credentials: 'include', signal: controller.signal });
    clearTimeout(tid);
    if (!resp.ok) return null;

    const buffer = await resp.arrayBuffer();
    if (buffer.byteLength > maxBytes) return null;

    const bytes = new Uint8Array(buffer);
    const mimeType = resp.headers.get('content-type') ?? 'application/octet-stream';
    const pathName = new URL(url).pathname;
    const segments = pathName.split('/').filter(Boolean);
    const raw = segments[segments.length - 1] ?? 'file';
    const fileName = decodeURIComponent(raw);

    const lower = mimeType.toLowerCase();
    const looksPdf =
      bytes.length >= 4 &&
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46;
    const isBinary =
      looksPdf ||
      lower.startsWith('application/pdf') ||
      lower.startsWith('image/') ||
      lower.startsWith('video/') ||
      lower.startsWith('audio/') ||
      lower.startsWith('application/zip') ||
      lower.startsWith('application/msword') ||
      lower.startsWith('application/vnd.');

    if (isBinary) {
      const CHUNK = 8192;
      let binary = '';
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...Array.from(bytes.slice(i, i + CHUNK)));
      }
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return {
        kind: 'binary',
        base64: btoa(binary),
        mimeType,
        size: bytes.length,
        sha256: hashArray.map((b) => b.toString(16).padStart(2, '0')).join(''),
        fileName,
      };
    }

    return {
      kind: 'html',
      mimeType,
      html: new TextDecoder('utf-8').decode(buffer).slice(0, 200_000),
      fileName,
      size: bytes.length,
    };
  } catch {
    return null;
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const nodeBuffer = (
    globalThis as { Buffer?: { from: (b: Uint8Array) => { toString: (enc: string) => string } } }
  ).Buffer;
  if (nodeBuffer !== undefined) {
    return nodeBuffer.from(bytes).toString('base64');
  }
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
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
    const target: IUploadTarget = { uploadUrl, driver, connectorToken, sourceId, provider };

    if (action === 'leaveLink') {
      return {
        ...op,
        record: {
          ...record,
          linkAccessibility: isInteractiveHost(fileUrl) ? 'public' : 'authenticated',
        },
      };
    }

    if (action === 'extractText') {
      return this._extractTextOp(op, record, fileUrl, target);
    }

    const entityExternalId = op.key?.externalId as string | undefined;
    const courseExternalId = record?.['courseExternalId'] as string | undefined;
    if (!entityExternalId) return op;

    return this._rehostUrl({
      op,
      record,
      fileUrl,
      target,
      entityType: 'courseMaterial',
      entityExternalId,
      courseExternalId: courseExternalId ?? '',
    });
  }

  private async _extractTextOp(
    op: ISlcDeltaOp,
    record: Record<string, unknown> | undefined,
    fileUrl: string,
    target: IUploadTarget
  ): Promise<ISlcDeltaOp> {
    const publicOp = {
      ...op,
      record: { ...record, linkAccessibility: 'public' as const },
    };
    try {
      const page = await target.driver.evaluate(
        fetchPageInWebView,
        fileUrl,
        MAX_FILE_BYTES,
        FETCH_TIMEOUT_MS
      );
      if (!page) return publicOp;

      if (page.kind === 'binary') {
        const entityExternalId = op.key?.externalId as string | undefined;
        const courseExternalId = record?.['courseExternalId'] as string | undefined;
        if (!entityExternalId) return publicOp;
        return this._rehostUrl({
          op,
          record,
          fileUrl,
          target,
          entityType: 'courseMaterial',
          entityExternalId,
          courseExternalId: courseExternalId ?? '',
          prefetched: page,
        });
      }

      const text = extractPageText(page.html);
      let nextRecord: Record<string, unknown> = {
        ...record,
        linkAccessibility: 'public',
        ...(text !== '' ? { extractedText: text } : {}),
      };

      const entityExternalId = op.key?.externalId as string | undefined;
      if (
        text.length >= SNAPSHOT_MIN_CHARS &&
        entityExternalId !== undefined &&
        entityExternalId !== ''
      ) {
        nextRecord = await this._maybeUploadSnapshot({
          record: nextRecord,
          text,
          fileUrl,
          target,
          entityExternalId,
          courseExternalId: (record?.['courseExternalId'] as string | undefined) ?? '',
        });
      }

      return { ...op, record: nextRecord };
    } catch {
      return publicOp;
    }
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
    const target: IUploadTarget = { uploadUrl, driver, connectorToken, sourceId, provider };

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

        const serverUrl = await this._uploadAsset(asset, fileUrl, target, {
          entityType: 'assignment',
          entityExternalId,
          courseExternalId: courseExternalId ?? '',
        });
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
    target: IUploadTarget;
    entityType: string;
    entityExternalId: string;
    courseExternalId: string;
    prefetched?: IFetchedAsset;
  }): Promise<ISlcDeltaOp> {
    const {
      op,
      record,
      fileUrl,
      target,
      entityType,
      entityExternalId,
      courseExternalId,
      prefetched,
    } = params;

    try {
      const asset =
        prefetched ??
        (await target.driver.evaluate(
          fetchAssetInWebView,
          fileUrl,
          MAX_FILE_BYTES,
          FETCH_TIMEOUT_MS
        ));
      if (!asset) return op;

      const serverUrl = await this._uploadAsset(asset, fileUrl, target, {
        entityType,
        entityExternalId,
        courseExternalId,
      });
      if (!serverUrl) return op;

      return { ...op, record: { ...record, url: serverUrl } };
    } catch {
      return op;
    }
  }

  private async _uploadAsset(
    asset: IFetchedAsset,
    originalUrl: string,
    target: IUploadTarget,
    ids: {
      readonly entityType: string;
      readonly entityExternalId: string;
      readonly courseExternalId: string;
    }
  ): Promise<string | null> {
    const uploadRes = await fetch(target.uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.connectorToken}`,
      },
      body: JSON.stringify({
        data: asset.base64,
        sourceId: target.sourceId,
        provider: target.provider,
        originalUrl,
        contentHash: asset.sha256,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        entityType: ids.entityType,
        entityExternalId: ids.entityExternalId,
        courseExternalId: ids.courseExternalId,
      }),
    });

    if (!uploadRes.ok) return null;
    const { serverUrl } = (await uploadRes.json()) as { serverUrl?: string };
    return serverUrl ?? null;
  }

  /** Optional one-page PDF of extracted article text. Original href is kept. */
  private async _maybeUploadSnapshot(params: {
    record: Record<string, unknown>;
    text: string;
    fileUrl: string;
    target: IUploadTarget;
    entityExternalId: string;
    courseExternalId: string;
  }): Promise<Record<string, unknown>> {
    const { record, text, fileUrl, target, entityExternalId, courseExternalId } = params;
    try {
      const title = typeof record['title'] === 'string' ? record['title'] : 'Article';
      const pdf = buildSimplePdf(title, text);
      const ascii = new TextDecoder().decode(pdf);
      const contentHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        ascii
      );
      const asset: IFetchedAsset = {
        base64: uint8ToBase64(pdf),
        mimeType: 'application/pdf',
        size: pdf.byteLength,
        sha256: contentHash,
        fileName: 'article-snapshot.pdf',
      };
      await this._uploadAsset(asset, fileUrl, target, {
        entityType: 'courseMaterial',
        entityExternalId,
        courseExternalId,
      });
    } catch {
      // Fail-open: extractedText is already on the record.
    }
    return record;
  }
}
