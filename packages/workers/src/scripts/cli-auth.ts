/**
 * CLI Authorization helper — supports two modes:
 *
 * 1. Direct login (automated / CI):
 *    Set SCHOLARACLE_EMAIL + SCHOLARACLE_PASSWORD env vars, or pass --email / --password flags.
 *    Calls /api/auth/login directly — no browser needed.
 *
 * 2. Device flow (interactive):
 *    Falls back to browser-based device code approval when credentials aren't provided.
 *
 * Usage in scripts:
 *   import { getCliToken } from './cli-auth';
 *   const token = await getCliToken('https://api.scholarmancy.com');
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { exec } from 'node:child_process';

const TOKEN_DIR = join(homedir(), '.scholaracle');
const TOKEN_FILE = join(TOKEN_DIR, 'cli-token.json');

interface ICachedToken {
  apiBaseUrl: string;
  token: string;
  issuedAt: string;
}

interface ILoginResponse {
  success: boolean;
  token?: string;
  error?: string;
}

interface IDeviceRequestResponse {
  success: boolean;
  deviceCode: string;
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  pollInterval: number;
  error?: string;
}

interface IPollResponse {
  success: boolean;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  token?: string;
  refreshToken?: string;
  error?: string;
}

function loadCachedToken(apiBaseUrl: string): string | null {
  try {
    const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8')) as ICachedToken;
    if (data.apiBaseUrl !== apiBaseUrl) return null;

    // Decode JWT to check expiry (no verification — server will reject if invalid)
    const payload = JSON.parse(
      Buffer.from(data.token.split('.')[1]!, 'base64').toString('utf-8')
    ) as { exp?: number };

    if (payload.exp && payload.exp * 1000 > Date.now() + 60_000) {
      return data.token;
    }
    return null;
  } catch {
    return null;
  }
}

function saveCachedToken(apiBaseUrl: string, token: string): void {
  mkdirSync(TOKEN_DIR, { recursive: true });
  writeFileSync(
    TOKEN_FILE,
    JSON.stringify(
      { apiBaseUrl, token, issuedAt: new Date().toISOString() } satisfies ICachedToken,
      null,
      2
    ),
    { mode: 0o600 }
  );
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'darwin'
      ? `open "${url}"`
      : process.platform === 'win32'
        ? `start "${url}"`
        : `xdg-open "${url}"`;
  exec(command, () => {
    /* ignore errors */
  });
}

async function httpJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  return (await res.json()) as T;
}

function getCredentials(): { email: string; password: string } | null {
  const email =
    process.argv.find((a) => a.startsWith('--email='))?.slice('--email='.length) ??
    process.env['SCHOLARACLE_EMAIL'];
  const password =
    process.argv.find((a) => a.startsWith('--password='))?.slice('--password='.length) ??
    process.env['SCHOLARACLE_PASSWORD'];

  if (email && password) return { email, password };
  return null;
}

async function directLogin(apiBaseUrl: string, email: string, password: string): Promise<string> {
  // eslint-disable-next-line no-console
  console.log(`Logging in as ${email}...`);

  const result = await httpJson<ILoginResponse>(`${apiBaseUrl}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  if (!result.success || !result.token) {
    throw new Error(`Login failed: ${result.error ?? 'invalid credentials'}`);
  }

  saveCachedToken(apiBaseUrl, result.token);
  // eslint-disable-next-line no-console
  console.log('Authenticated! Token cached at ~/.scholaracle/cli-token.json\n');
  return result.token;
}

export async function getCliToken(apiBaseUrl: string): Promise<string> {
  // 1. Check cache
  const cached = loadCachedToken(apiBaseUrl);
  if (cached) {
    // eslint-disable-next-line no-console
    console.log('Using cached CLI token.');
    return cached;
  }

  // 2. Try direct login if credentials are available
  const creds = getCredentials();
  if (creds) {
    return directLogin(apiBaseUrl, creds.email, creds.password);
  }

  // 3. Fall back to device flow
  // eslint-disable-next-line no-console
  console.log('Requesting CLI authorization...\n');
  const reqResult = await httpJson<IDeviceRequestResponse>(`${apiBaseUrl}/api/auth/cli/request`, {
    method: 'POST',
  });

  if (!reqResult.success) {
    throw new Error(`Failed to request device code: ${reqResult.error ?? 'unknown error'}`);
  }

  const { deviceCode, userCode, verificationUrl, expiresIn, pollInterval } = reqResult;

  // 3. Display code and open browser
  // eslint-disable-next-line no-console
  console.log('  ┌──────────────────────────────────────┐');
  // eslint-disable-next-line no-console
  console.log(`  │  Your code:  ${userCode}            │`);
  // eslint-disable-next-line no-console
  console.log('  └──────────────────────────────────────┘');
  // eslint-disable-next-line no-console
  console.log(`\n  Visit: ${verificationUrl}`);
  // eslint-disable-next-line no-console
  console.log('  Enter the code above and click Approve.\n');

  openBrowser(verificationUrl);

  // 4. Poll for approval
  const deadline = Date.now() + expiresIn * 1000;
  const intervalMs = (pollInterval || 5) * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const poll = await httpJson<IPollResponse>(`${apiBaseUrl}/api/auth/cli/poll/${deviceCode}`);

    if (poll.status === 'approved' && poll.token) {
      saveCachedToken(apiBaseUrl, poll.token);
      // eslint-disable-next-line no-console
      console.log('  Authorized! Token cached at ~/.scholaracle/cli-token.json\n');
      return poll.token;
    }

    if (poll.status === 'denied') {
      throw new Error('Authorization denied by user.');
    }

    if (poll.status === 'expired') {
      throw new Error('Authorization code expired.');
    }

    process.stdout.write('.');
  }

  throw new Error('Authorization timed out.');
}
