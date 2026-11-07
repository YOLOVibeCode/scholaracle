import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const mobilePkg = join(__dirname, '../../../mobile/package.json');

function hermesCompilerRoot(): string {
  const requireFromMobile = createRequire(mobilePkg);
  return dirname(requireFromMobile.resolve('hermes-compiler/package.json'));
}

function hermescBinDir(): string {
  if (process.platform === 'darwin') {
    return 'osx-bin';
  }
  if (process.platform === 'win32') {
    return 'win64-bin';
  }
  return 'linux64-bin';
}

/** Hermes compiler CLI shipped with React Native (hermes-compiler npm). */
export function resolveHermescPath(): string {
  const exe = process.platform === 'win32' ? 'hermesc.exe' : 'hermesc';
  const path = join(hermesCompilerRoot(), 'hermesc', hermescBinDir(), exe);
  if (!existsSync(path)) {
    throw new Error(
      `hermesc not found at ${path}. Install workspace deps (includes react-native via packages/mobile).`
    );
  }
  return path;
}

/** Pinned Hermes compiler version from the mobile React Native dependency chain. */
export function readHermesCompilerVersion(): string {
  const requireFromMobile = createRequire(mobilePkg);
  const pkgPath = requireFromMobile.resolve('hermes-compiler/package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  return pkg.version;
}
