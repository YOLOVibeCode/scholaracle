import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { get as httpsGet } from 'node:https';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readHermesCompilerVersion } from './hermesToolchain';

const CACHE_ROOT = join(tmpdir(), 'scholaracle-hermes-smoke');
const ICU_DEB_PATH = '/ubuntu/pool/main/i/icu/libicu70_70.1-2ubuntu1_amd64.deb';
/**
 * Tried in order. CI runners have failed to resolve every ubuntu.com host at once
 * (getaddrinfo EAI_AGAIN), so the list mixes domains: the OSUOSL and Leaseweb mirrors
 * carry the same package and do not depend on ubuntu.com DNS. azure.archive.ubuntu.com is
 * the mirror GitHub's Azure runners use for apt.
 */
const ICU_DEB_URLS = [
  `https://archive.ubuntu.com${ICU_DEB_PATH}`,
  `https://ftp.osuosl.org/pub${ICU_DEB_PATH}`,
  `https://azure.archive.ubuntu.com${ICU_DEB_PATH}`,
  `https://mirror.us.leaseweb.net${ICU_DEB_PATH}`,
];

/**
 * SHA-256 of libicu70_70.1-2ubuntu1_amd64.deb (10,581,724 bytes). Pinned from the bytes four
 * mirrors agree on (archive.ubuntu.com, OSUOSL, Leaseweb, azure.archive.ubuntu.com): this build
 * is no longer listed in the signed jammy indexes, which carry 70.1-2. A mirror once answered 200
 * with a truncated file, and a mirror list is only safe if every copy is checked.
 */
const ICU_DEB_SHA256 = '223c1e6cebf2a6748637303227d8b84337c14a2d30eacbc46a68d02557dcff3e';

function hermesReleaseTag(compilerVersion: string): string {
  const match = /^(\d+\.0\.)\d+$/.exec(compilerVersion);
  if (!match) {
    throw new Error(`Unexpected hermes-compiler version: ${compilerVersion}`);
  }
  return `hermes-bin-v${match[1]}16`;
}

function platformSlug(): string {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  }
  return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
}

/** Node's connection errors can be an AggregateError with an empty message; say which host and why. */
function describeNetworkError(url: string, err: unknown): Error {
  const parts: string[] = [];
  const inner = (err as { errors?: unknown[] } | null)?.errors;
  if (Array.isArray(inner) && inner.length > 0) {
    for (const e of inner) {
      const { code, address, port, message } = e as {
        code?: string;
        address?: string;
        port?: number;
        message?: string;
      };
      parts.push([code, address && `${address}:${port ?? ''}`, message].filter(Boolean).join(' '));
    }
  } else if (err instanceof Error) {
    parts.push(err.message || err.name);
  } else {
    parts.push(String(err));
  }
  return new Error(`GET ${url} failed: ${parts.join('; ')}`);
}

function downloadOnce(url: string, dest: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const run = (fetchUrl: string): void => {
      httpsGet(fetchUrl, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          run(res.headers.location);
          return;
        }
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`GET ${fetchUrl} failed: HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const file = createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', reject);
      }).on('error', (err) => reject(describeNetworkError(fetchUrl, err)));
    };
    run(url);
  });
}

const DOWNLOAD_ATTEMPTS = 4;
/** With several mirrors, a dead host should cost two tries, not four, before the next one. */
const ATTEMPTS_PER_MIRROR = 2;

interface IDownloadDeps {
  downloadOnce: (url: string, dest: string) => Promise<void>;
  sleep: (ms: number) => Promise<void>;
  sha256Of: (file: string) => string;
}

const realDownloadDeps: IDownloadDeps = {
  downloadOnce,
  sleep: (ms) => new Promise<void>((r) => setTimeout(r, ms)),
  sha256Of: (file) => createHash('sha256').update(readFileSync(file)).digest('hex'),
};

function verifyDownload(
  deps: IDownloadDeps,
  url: string,
  dest: string,
  expectedSha256: string | undefined
): void {
  if (expectedSha256 === undefined) {
    return;
  }
  const actual = deps.sha256Of(dest);
  if (actual !== expectedSha256) {
    throw new Error(
      `GET ${url} returned unexpected content (sha256 ${actual.slice(0, 12)}, expected ${expectedSha256.slice(0, 12)})`
    );
  }
}

/**
 * Mirrors and release hosts drop connections from CI runners now and then. Retry each URL,
 * then move to the next one; the last error is thrown if every URL fails. With expectedSha256,
 * a copy whose bytes differ (a truncated body, a captive-portal page) counts as a failed try.
 */
export async function downloadFromMirrors(
  urls: readonly string[],
  dest: string,
  overrides: Partial<IDownloadDeps> = {},
  expectedSha256?: string
): Promise<void> {
  const deps: IDownloadDeps = { ...realDownloadDeps, ...overrides };
  const attempts = urls.length > 1 ? ATTEMPTS_PER_MIRROR : DOWNLOAD_ATTEMPTS;
  let lastError: unknown;
  for (const url of urls) {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await deps.downloadOnce(url, dest);
        verifyDownload(deps, url, dest, expectedSha256);
        return;
      } catch (err) {
        lastError = err;
        if (attempt < attempts) {
          await deps.sleep(2000 * attempt);
        }
      }
    }
  }
  throw lastError;
}

function downloadFile(url: string, dest: string): Promise<void> {
  return downloadFromMirrors([url], dest);
}

let hvmPathPromise: Promise<string> | null = null;
let icuLibPromise: Promise<string> | null = null;

/** Standalone Hermes VM (hvm) matching the React Native Hermes compiler version. */
export function resolveHvmPath(): Promise<string> {
  const override = process.env['HERMES_VM_BIN'];
  if (override) {
    return Promise.resolve(override);
  }
  if (hvmPathPromise === null) {
    hvmPathPromise = ensureHvmBinary().catch((err: unknown) => {
      hvmPathPromise = null;
      throw err;
    });
  }
  return hvmPathPromise;
}

async function ensureHvmBinary(): Promise<string> {
  const cacheDir = join(CACHE_ROOT, 'vm-bin');
  const hvmPath = join(cacheDir, 'hvm');
  if (existsSync(hvmPath)) {
    return hvmPath;
  }

  const tag = hermesReleaseTag(readHermesCompilerVersion());
  const versionCore = tag.replace('hermes-bin-v', '');
  const url = `https://github.com/malopezr7/argus/releases/download/${tag}/hermes-${versionCore}-${platformSlug()}.tar.gz`;
  mkdirSync(cacheDir, { recursive: true });
  const tgz = join(cacheDir, 'hermes-vm.tgz');
  await downloadFile(url, tgz);
  execFileSync('tar', ['-xzf', tgz, '-C', cacheDir, 'hvm'], { stdio: 'pipe' });
  if (!existsSync(hvmPath)) {
    throw new Error(`hvm not found after extracting ${url}`);
  }
  chmodSync(hvmPath, 0o755);
  return hvmPath;
}

/** Directory of libicu70 shared libraries required by the prebuilt hvm binary on Linux. */
export function resolveIcuLibraryPath(): Promise<string> {
  if (process.platform !== 'linux') {
    return Promise.resolve('');
  }
  if (icuLibPromise === null) {
    icuLibPromise = ensureIcu70Libraries().catch((err: unknown) => {
      icuLibPromise = null;
      throw err;
    });
  }
  return icuLibPromise;
}

async function ensureIcu70Libraries(): Promise<string> {
  const libDir = join(CACHE_ROOT, 'icu70', 'usr/lib/x86_64-linux-gnu');
  const marker = join(libDir, 'libicuuc.so.70');
  if (existsSync(marker)) {
    return libDir;
  }
  mkdirSync(join(CACHE_ROOT, 'icu70'), { recursive: true });
  const deb = join(CACHE_ROOT, 'icu70', 'libicu70.deb');
  await downloadFromMirrors(ICU_DEB_URLS, deb, {}, ICU_DEB_SHA256);
  execFileSync('dpkg-deb', ['-x', deb, join(CACHE_ROOT, 'icu70')], { stdio: 'pipe' });
  if (!existsSync(marker)) {
    throw new Error(`libicuuc.so.70 missing after extracting ${ICU_DEB_URLS[0]}`);
  }
  return libDir;
}
