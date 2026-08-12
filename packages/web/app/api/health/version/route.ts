import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Deployed-version endpoint. Railway injects the git SHA at deploy time;
 * CI polls this to confirm an environment is actually running a given
 * commit (health alone can't distinguish old deploy from new).
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      commit: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'unknown',
      branch: process.env['RAILWAY_GIT_BRANCH'] ?? 'unknown',
      timestamp: new Date().toISOString(),
    },
    { status: 200 }
  );
}
