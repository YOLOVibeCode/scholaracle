/**
 * WebViewAssetHost — unit tests.
 *
 * We test the op-routing logic without making real HTTP calls.
 * IPageDriver.evaluate and the fetch upload are stubbed.
 */

import { WebViewAssetHost } from './WebViewAssetHost';
import type { ISlcDeltaOp } from '@scholaracle/contracts';

const PORTAL_ORIGIN = 'https://school.instructure.com';
const API_BASE = 'https://api.scholarmancy.com';
const SOURCE_ID = 'test-source';
const CONNECTOR_TOKEN = 'test-token';

function makeMaterialOp(url: string, externalId = 'mat-1'): ISlcDeltaOp {
  return {
    op: 'upsert',
    entity: 'courseMaterial',
    key: {
      externalId,
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      studentExternalId: 'stu-1',
    },
    observedAt: new Date().toISOString(),
    record: {
      title: 'Test File',
      url,
      courseExternalId: 'course-1',
    },
  };
}

function makeDeleteOp(): ISlcDeltaOp {
  return {
    op: 'delete',
    entity: 'courseMaterial',
    key: {
      externalId: 'mat-del',
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      studentExternalId: 'stu-1',
    },
    observedAt: new Date().toISOString(),
  };
}

function makeAssignmentOp(): ISlcDeltaOp {
  return {
    op: 'upsert',
    entity: 'assignment',
    key: {
      externalId: 'asn-1',
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      studentExternalId: 'stu-1',
    },
    observedAt: new Date().toISOString(),
    record: { title: 'HW 1' },
  };
}

function buildHost(evaluateMock: jest.Mock, fetchMock?: jest.Mock) {
  const driver = {
    evaluate: evaluateMock,
    goto: jest.fn(),
    url: jest.fn(),
    content: jest.fn(),
    waitForLoad: jest.fn(),
    waitForUrlIncludes: jest.fn(),
    sleep: jest.fn(),
    onNewPage: jest.fn(),
  };

  if (fetchMock) {
    (global as Record<string, unknown>)['fetch'] = fetchMock;
  }

  return new WebViewAssetHost({
    driver,
    connectorToken: CONNECTOR_TOKEN,
    sourceId: SOURCE_ID,
    provider: 'canvas',
    portalOrigin: PORTAL_ORIGIN,
    apiBaseUrl: API_BASE,
  });
}

describe('WebViewAssetHost.processOps', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes through non-courseMaterial ops unchanged', async () => {
    const host = buildHost(jest.fn());
    const ops = [makeAssignmentOp()];
    const result = await host.processOps(ops);
    expect(result).toEqual(ops);
  });

  it('passes through delete ops unchanged', async () => {
    const host = buildHost(jest.fn());
    const ops = [makeDeleteOp()];
    const result = await host.processOps(ops);
    expect(result).toEqual(ops);
  });

  it('annotates public external materials with linkAccessibility', async () => {
    const host = buildHost(jest.fn());
    const op = makeMaterialOp('https://other.example.com/file.pdf');
    const result = await host.processOps([op]);
    // Unprobed public URLs are extractText; a no-op evaluate still marks public.
    expect(result).toEqual([
      {
        ...op,
        record: { ...(op.record as object), linkAccessibility: 'public' },
      },
    ]);
  });

  it('extracts article text from public HTML and keeps the original href', async () => {
    const evaluateMock = jest.fn().mockResolvedValue({
      kind: 'html',
      mimeType: 'text/html',
      html: '<html><body><p>Scout narrates. Cite the novel.</p></body></html>',
      fileName: 'mocking',
      size: 64,
    });
    const host = buildHost(evaluateMock);
    const op = makeMaterialOp('https://www.sparknotes.com/lit/mocking/');
    const result = await host.processOps([op]);
    expect(result[0]?.record?.['extractedText']).toMatch(/Scout narrates/);
    expect(result[0]?.record?.['linkAccessibility']).toBe('public');
    expect(result[0]?.record?.['url']).toBe('https://www.sparknotes.com/lit/mocking/');
  });

  it('uploads a snapshot PDF when extracted article text is long', async () => {
    const html = `<html><body><p>${'Scout Finch. '.repeat(40)}</p></body></html>`;
    const evaluateMock = jest.fn().mockResolvedValue({
      kind: 'html',
      mimeType: 'text/html',
      html,
      fileName: 'mocking',
      size: html.length,
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assetId: 'asset-snap',
        serverUrl: 'https://api.scholarmancy.com/api/assets/asset-snap',
      }),
    });
    const host = buildHost(evaluateMock, fetchMock);
    const op = makeMaterialOp('https://www.sparknotes.com/lit/mocking/');
    const result = await host.processOps([op]);
    expect(fetchMock).toHaveBeenCalled();
    expect(result[0]?.record?.['url']).toBe('https://www.sparknotes.com/lit/mocking/');
    expect(String(result[0]?.record?.['extractedText'])).toMatch(/Scout Finch/);
  });

  it('rehosts when an extractText fetch is actually a PDF', async () => {
    const evaluateMock = jest.fn().mockResolvedValue({
      kind: 'binary',
      base64: 'dGVzdA==',
      mimeType: 'application/pdf',
      size: 4,
      sha256: 'abc123',
      fileName: 'hw.pdf',
    });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        assetId: 'asset-pdf',
        serverUrl: 'https://api.scholarmancy.com/api/assets/asset-pdf',
      }),
    });
    const host = buildHost(evaluateMock, fetchMock);
    const op = makeMaterialOp('https://school.edu/hw.pdf');
    const result = await host.processOps([op]);
    expect(result[0]?.record?.['url']).toBe('https://api.scholarmancy.com/api/assets/asset-pdf');
  });

  it('marks Khan Academy as a public leave-link without fetching', async () => {
    const evaluateMock = jest.fn();
    const host = buildHost(evaluateMock);
    const op = makeMaterialOp(
      'https://www.khanacademy.org/science/ap-biology/cell-communication-and-cell-cycle'
    );
    const result = await host.processOps([op]);
    expect(evaluateMock).not.toHaveBeenCalled();
    expect(result[0]?.record?.['linkAccessibility']).toBe('public');
    expect(result[0]?.record?.['url']).toContain('khanacademy.org');
  });

  it('marks Canvas assignment pages as authenticated without fetching', async () => {
    const evaluateMock = jest.fn();
    const host = buildHost(evaluateMock);
    const op = makeMaterialOp(`${PORTAL_ORIGIN}/courses/1/assignments/2`);
    const result = await host.processOps([op]);
    expect(evaluateMock).not.toHaveBeenCalled();
    expect(result[0]?.record?.['linkAccessibility']).toBe('authenticated');
  });

  it('rewrites portal URL to serverUrl on successful fetch + upload', async () => {
    const fetchedAsset = {
      base64: 'dGVzdA==',
      mimeType: 'application/pdf',
      size: 4,
      sha256: 'abc123',
      fileName: 'worksheet.pdf',
    };
    const evaluateMock = jest.fn().mockResolvedValue(fetchedAsset);

    const uploadResponse = {
      ok: true,
      json: async () => ({
        assetId: 'asset-1',
        serverUrl: 'https://api.scholarmancy.com/api/assets/asset-1',
      }),
    };
    const fetchMock = jest.fn().mockResolvedValue(uploadResponse);

    const host = buildHost(evaluateMock, fetchMock);
    const op = makeMaterialOp(`${PORTAL_ORIGIN}/files/555/download`);
    const result = await host.processOps([op]);

    expect(result[0]?.record?.['url']).toBe('https://api.scholarmancy.com/api/assets/asset-1');
  });

  it('keeps original op when evaluate returns null (file too large / fetch error)', async () => {
    const evaluateMock = jest.fn().mockResolvedValue(null);
    const host = buildHost(evaluateMock);
    const op = makeMaterialOp(`${PORTAL_ORIGIN}/files/999/download`);
    const result = await host.processOps([op]);
    expect(result[0]?.record?.['url']).toBe(`${PORTAL_ORIGIN}/files/999/download`);
  });

  it('keeps original op when upload returns non-ok response', async () => {
    const evaluateMock = jest.fn().mockResolvedValue({
      base64: 'dGVzdA==',
      mimeType: 'application/pdf',
      size: 4,
      sha256: 'abc123',
      fileName: 'file.pdf',
    });
    const fetchMock = jest.fn().mockResolvedValue({ ok: false });
    const host = buildHost(evaluateMock, fetchMock);
    const op = makeMaterialOp(`${PORTAL_ORIGIN}/files/111/download`);
    const result = await host.processOps([op]);
    expect(result[0]?.record?.['url']).toBe(`${PORTAL_ORIGIN}/files/111/download`);
  });

  it('keeps original op when evaluate throws (fail-open)', async () => {
    const evaluateMock = jest.fn().mockRejectedValue(new Error('WebView timeout'));
    const host = buildHost(evaluateMock);
    const op = makeMaterialOp(`${PORTAL_ORIGIN}/files/222/download`);
    const result = await host.processOps([op]);
    expect(result[0]?.record?.['url']).toBe(`${PORTAL_ORIGIN}/files/222/download`);
  });
});
