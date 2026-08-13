import { readFileSync } from 'fs';
import { join } from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROCESS_STARTED_AT = new Date().toISOString();

function tryRead(path: string): string | null {
  try {
    const value = readFileSync(path, 'utf8').trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function readBuiltAt(): string {
  const fromEnv = process.env['SCHOLARMANCY_BUILT_AT']?.trim();
  if (fromEnv) return fromEnv;
  return tryRead('/app/BUILT_AT') ?? tryRead(join(process.cwd(), 'BUILT_AT')) ?? PROCESS_STARTED_AT;
}

/**
 * Deployed-version endpoint. Railway injects the git SHA at deploy time;
 * CI polls this to confirm an environment is actually running a given
 * commit (health alone can't distinguish old deploy from new).
 *
 * `builtAt` is image-build time (or process start locally). `timestamp` is
 * request time — do not use it to identify a deploy.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      commit: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'unknown',
      branch: process.env['RAILWAY_GIT_BRANCH'] ?? 'unknown',
      builtAt: readBuiltAt(),
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
