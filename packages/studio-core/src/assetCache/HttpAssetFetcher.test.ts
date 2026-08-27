import { createHttpAssetFetcher } from './HttpAssetFetcher';

describe('createHttpAssetFetcher', () => {
  it('forwards If-None-Match and returns 304 with no body', async () => {
    const fetchFn = jest.fn(async () => ({
      status: 304,
      arrayBuffer: async () => new ArrayBuffer(0),
      headers: { get: () => null },
    }));
    const fetcher = createHttpAssetFetcher(fetchFn);
    const result = await fetcher.fetch('https://cdn.example.test/a.pdf?sig=ticket', {
      ifNoneMatch: '"abc"',
    });
    expect(fetchFn).toHaveBeenCalledWith('https://cdn.example.test/a.pdf?sig=ticket', {
      headers: { 'If-None-Match': '"abc"' },
    });
    expect(result).toEqual({ status: 304, body: null });
  });

  it('returns body and content-type on 200', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const fetchFn = jest.fn(async () => ({
      status: 200,
      arrayBuffer: async () => Uint8Array.from(bytes).buffer,
      headers: { get: (name: string) => (name === 'content-type' ? 'application/pdf' : null) },
    }));
    const result = await createHttpAssetFetcher(fetchFn).fetch(
      '/studio/fixtures/lab-safety.pdf',
      {}
    );
    expect(result.status).toBe(200);
    expect(result.contentType).toBe('application/pdf');
    expect(Array.from(result.body ?? [])).toEqual(Array.from(bytes));
  });
});
