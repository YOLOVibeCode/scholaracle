import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const utc = new Date().toISOString();
  return NextResponse.json(
    {
      status: 'ok',
      ok: true,
      service: 'scholarmancy-web',
      commit:
        process.env['RAILWAY_GIT_COMMIT_SHA'] ??
        process.env['VERCEL_GIT_COMMIT_SHA'] ??
        process.env['GIT_COMMIT'] ??
        'unknown',
      env: process.env['APP_ENV'] ?? process.env['RAILWAY_ENVIRONMENT_NAME'] ?? 'dev',
      utc,
    },
    { status: 200 }
  );
}
