import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHermesHarness } from './buildHermesHarness';
import { resolveHermescPath } from './hermesToolchain';
import { resolveHvmPath, resolveIcuLibraryPath } from './hermesVmRuntime';

interface ISmokeResult {
  readonly ok: boolean;
  readonly error?: string;
}

function parseSmokeStdout(stdout: string): ISmokeResult {
  const line = stdout
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('{'));
  if (!line) {
    throw new Error(`Hermes smoke produced no JSON output: ${stdout.slice(0, 200)}`);
  }
  const parsed = JSON.parse(line) as ISmokeResult;
  return parsed;
}

/** Compile page-function source with hermesc and execute it in the Hermes VM (hvm). */
export async function compileAndRunHermesSmoke(
  pageFnId: string,
  pageFnSource: string,
  args: unknown
): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), 'slc-hermes-'));
  try {
    const harnessPath = join(work, 'harness.js');
    const bytePath = join(work, 'harness.hbc');
    writeFileSync(harnessPath, buildHermesHarness(pageFnSource, args), 'utf8');

    const hermesc = resolveHermescPath();
    execFileSync(hermesc, ['-emit-binary', '-out', bytePath, harnessPath], { stdio: 'pipe' });
    if (!readFileSync(bytePath).length) {
      throw new Error(`${pageFnId}: hermesc produced empty bytecode`);
    }

    const hvm = await resolveHvmPath();
    const icuLib = await resolveIcuLibraryPath();
    const env =
      icuLib.length > 0
        ? { ...process.env, LD_LIBRARY_PATH: `${icuLib}:${process.env['LD_LIBRARY_PATH'] ?? ''}` }
        : process.env;
    const stdout = execFileSync(hvm, [bytePath], { encoding: 'utf8', env }).trim();
    const result = parseSmokeStdout(stdout);
    if (!result.ok) {
      throw new Error(`${pageFnId}: Hermes VM smoke failed: ${result.error ?? 'unknown'}`);
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
