import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 127 || a === 10 || a === 0) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fe80:')) return true;
  const first = normalized.split(':')[0] ?? '';
  if (first.startsWith('fc') || first.startsWith('fd')) return true;
  return false;
}

function isPrivateLiteralHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  const version = isIP(h);
  if (version === 4) return isPrivateIpv4(h);
  if (version === 6) return isPrivateIpv6(h);
  return false;
}

/** Returns true when host must not be fetched (private, loopback, or unresolvable). */
export async function isPrivateAddress(hostname: string): Promise<boolean> {
  if (isPrivateLiteralHost(hostname)) return true;
  if (isIP(hostname) !== 0) return false;

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.some((r) => {
      if (r.family === 4) return isPrivateIpv4(r.address);
      return isPrivateIpv6(r.address);
    });
  } catch {
    return true;
  }
}
