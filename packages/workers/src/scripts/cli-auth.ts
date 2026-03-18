/**
 * CLI Device Authorization helper.
 *
 * Usage in scripts:
 *   import { getCliToken } from './cli-auth';
 *   const token = await getCliToken('https://api.scholarmancy.com');
 *
 * Flow:
 *   1. Checks ~/.scholaracle/cli-token.json for a cached token
 *   2. If valid, returns it
 *   3. Otherwise, initiates device auth flow:
 *      - Requests a device code from the API
 *      - Opens the browser to the approval page
 *      - Polls until approved
 *      - Caches the token locally
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

export async function getCliToken(apiBaseUrl: string): Promise<string> {
  // 1. Check cache
  const cached = loadCachedToken(apiBaseUrl);
  if (cached) {
    // eslint-disable-next-line no-console
    console.log('Using cached CLI token.');
    return cached;
  }

  // 2. Request device code
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
