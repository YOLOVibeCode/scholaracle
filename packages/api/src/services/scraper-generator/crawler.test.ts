import { lookup } from 'node:dns/promises';
import { connectStep } from './crawler';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

describe('connectStep SSRF guard', () => {
  const origFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    mockLookup.mockReset();
  });

  afterEach(() => {
    global.fetch = origFetch;
  });

  it('should not fetch private literal hosts', async () => {
    const result = await connectStep('http://127.0.0.1/login');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('private or internal');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should not fetch localhost', async () => {
    const result = await connectStep('https://localhost/admin');
    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should not fetch when DNS resolves to private addresses', async () => {
    mockLookup.mockResolvedValue([{ address: '192.168.1.10', family: 4 }] as never);
    const result = await connectStep('https://school.example/login');
    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should fetch public URLs when DNS is public', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    });

    const result = await connectStep('https://example.com/login');
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalled();
  });
});
