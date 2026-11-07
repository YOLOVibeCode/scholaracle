import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { get as httpsGet } from 'node:https';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readHermesCompilerVersion } from './hermesToolchain';

const CACHE_ROOT = join(tmpdir(), 'scholaracle-hermes-smoke');
const ICU_DEB_URL =
  'https://archive.ubuntu.com/ubuntu/pool/main/i/icu/libicu70_70.1-2ubuntu1_amd64.deb';

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

async function downloadFile(url: string, dest: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
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
      }).on('error', reject);
    };
    run(url);
  });
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
    hvmPathPromise = ensureHvmBinary();
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
    icuLibPromise = ensureIcu70Libraries();
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
  await downloadFile(ICU_DEB_URL, deb);
  execFileSync('dpkg-deb', ['-x', deb, join(CACHE_ROOT, 'icu70')], { stdio: 'pipe' });
  if (!existsSync(marker)) {
    throw new Error(`libicuuc.so.70 missing after extracting ${ICU_DEB_URL}`);
  }
  return libDir;
}
