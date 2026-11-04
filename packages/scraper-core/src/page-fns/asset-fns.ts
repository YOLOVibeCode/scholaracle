/**
 * Page functions that fetch a file or page inside the portal WebView, using the
 * portal session's cookies. They run in the page, so each one MUST be
 * self-contained (no closure references). Moved from the mobile asset host so
 * they are in the build-time page-function table (src/page-fns/registry.ts).
 */

/** Shape of the data returned from the in-WebView file fetch. */
export interface IFetchedAsset {
  readonly base64: string;
  readonly mimeType: string;
  readonly size: number;
  /** SHA-256 hex digest of the file bytes, computed in the WebView via SubtleCrypto. */
  readonly sha256: string;
  readonly fileName: string;
}

export interface IFetchedHtml {
  readonly kind: 'html';
  readonly mimeType: string;
  readonly html: string;
  readonly fileName: string;
  readonly size: number;
}

export interface IFetchedBinary extends IFetchedAsset {
  readonly kind: 'binary';
}

export type IFetchedPage = IFetchedHtml | IFetchedBinary;

/**
 * Fetch a file from within the WebView's authenticated session.
 * This function runs as a string-serialised script inside the page context —
 * it MUST be self-contained (no closure references).
 */
export async function fetchAssetInWebView(
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
export async function fetchPageInWebView(
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
