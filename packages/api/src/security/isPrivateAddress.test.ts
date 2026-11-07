import { lookup } from 'node:dns/promises';
import { isPrivateAddress } from './isPrivateAddress';

jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

describe('isPrivateAddress', () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  it('should block loopback and RFC1918 literals without DNS', async () => {
    await expect(isPrivateAddress('127.0.0.1')).resolves.toBe(true);
    await expect(isPrivateAddress('10.0.0.1')).resolves.toBe(true);
    await expect(isPrivateAddress('192.168.0.1')).resolves.toBe(true);
    await expect(isPrivateAddress('localhost')).resolves.toBe(true);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('should allow public literal IPs without DNS', async () => {
    await expect(isPrivateAddress('8.8.8.8')).resolves.toBe(false);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('should block when DNS resolves to a private address', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }] as never);
    await expect(isPrivateAddress('evil.example')).resolves.toBe(true);
  });

  it('should allow when DNS resolves only to public addresses', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as never);
    await expect(isPrivateAddress('example.com')).resolves.toBe(false);
  });

  it('should block when DNS lookup fails', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(isPrivateAddress('missing.example')).resolves.toBe(true);
  });
});
