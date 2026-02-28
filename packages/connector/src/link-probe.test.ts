import { probeLinkAccessibility, probeLinkAccessibilityBatch } from './link-probe';

describe('probeLinkAccessibility', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should return public for 200', async () => {
    fetchSpy.mockResolvedValueOnce({ status: 200, url: 'https://example.com' });
    expect(await probeLinkAccessibility('https://example.com')).toBe('public');
  });

  it('should return authenticated for 401', async () => {
    fetchSpy.mockResolvedValueOnce({ status: 401, url: 'https://example.com' });
    expect(await probeLinkAccessibility('https://example.com')).toBe('authenticated');
  });

  it('should return authenticated for 403', async () => {
    fetchSpy.mockResolvedValueOnce({ status: 403, url: 'https://example.com' });
    expect(await probeLinkAccessibility('https://example.com')).toBe('authenticated');
  });

  it('should return authenticated when redirect URL contains login', async () => {
    fetchSpy.mockResolvedValueOnce({
      status: 302,
      url: 'https://example.com/signin',
      headers: new Headers({ location: 'https://example.com/login' }),
    });
    expect(await probeLinkAccessibility('https://example.com')).toBe('authenticated');
  });

  it('should return unknown for non-http URL', async () => {
    expect(await probeLinkAccessibility('ftp://example.com')).toBe('unknown');
    expect(await probeLinkAccessibility('')).toBe('unknown');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should return unknown on fetch error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));
    expect(await probeLinkAccessibility('https://example.com')).toBe('unknown');
  });
});

describe('probeLinkAccessibilityBatch', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should return map of url -> accessibility', async () => {
    fetchSpy.mockResolvedValueOnce({ status: 200 }).mockResolvedValueOnce({ status: 401 });
    const result = await probeLinkAccessibilityBatch(['https://a.com', 'https://b.com'], 2);
    expect(result.get('https://a.com')).toBe('public');
    expect(result.get('https://b.com')).toBe('authenticated');
  });
});
