import {
  EMMA_LAB_SAFETY_FIXTURE_URL,
  EMMA_LAB_SAFETY_FIXTURE_URL_V2,
  EMMA_LAB_SAFETY_HASH,
  EMMA_LAB_SAFETY_HASH_V2,
  EMMA_LAB_SAFETY_PDF_V1,
  EMMA_LAB_SAFETY_PDF_V2,
} from '@scholaracle/studio-core';

export interface IStudioFixturePdfResult {
  readonly status: 200 | 304 | 404;
  readonly body: Uint8Array | null;
  readonly headers: Record<string, string>;
}

const FILES: Record<string, { hash: string; body: Uint8Array }> = {
  'lab-safety.pdf': { hash: EMMA_LAB_SAFETY_HASH, body: EMMA_LAB_SAFETY_PDF_V1 },
  'lab-safety-v2.pdf': { hash: EMMA_LAB_SAFETY_HASH_V2, body: EMMA_LAB_SAFETY_PDF_V2 },
};

/** Same-origin fixture PDFs with ETag = quoted contentHash so AssetCache can 304. */
export function studioFixturePdf(
  file: string,
  ifNoneMatch: string | null
): IStudioFixturePdfResult {
  const rec = FILES[file];
  if (rec === undefined) {
    return { status: 404, body: null, headers: {} };
  }
  const etag = `"${rec.hash}"`;
  const headers = {
    ETag: etag,
    'Content-Type': 'application/pdf',
    'Cache-Control': 'private, max-age=86400, immutable',
  };
  if (ifNoneMatch === etag || ifNoneMatch === rec.hash) {
    return { status: 304, body: null, headers: { ETag: etag } };
  }
  return { status: 200, body: rec.body, headers };
}

export const STUDIO_FIXTURE_PATHS = {
  v1: EMMA_LAB_SAFETY_FIXTURE_URL,
  v2: EMMA_LAB_SAFETY_FIXTURE_URL_V2,
} as const;
