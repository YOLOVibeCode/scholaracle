import { readFileSync } from 'fs';
import { join } from 'path';
import { Router, type Request, type Response } from 'express';

export const healthRouter: Router = Router();

/**
 * Time this API image/process came into existence.
 *
 * Railway does not inject a deploy timestamp. Prefer `/app/BUILT_AT` written
 * at Docker image build; fall back to process start (local `pnpm dev`, or an
 * image built before the stamp existed).
 */
const PROCESS_STARTED_AT = new Date().toISOString();

function tryRead(path: string): string | null {
  try {
    const value = readFileSync(path, 'utf8').trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function readBuiltAt(): string {
  const fromEnv = process.env['SCHOLARMANCY_BUILT_AT']?.trim();
  if (fromEnv) return fromEnv;
  return tryRead('/app/BUILT_AT') ?? tryRead(join(process.cwd(), 'BUILT_AT')) ?? PROCESS_STARTED_AT;
}

/**
 * Health check endpoint.
 * Returns server status and current timestamp.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Deployed-version endpoint. Railway injects the git SHA at deploy time;
 * CI polls this to confirm an environment is actually running a given
 * commit (health alone can't distinguish old deploy from new).
 *
 * `builtAt` is image-build time (or process start locally). `timestamp` is
 * request time — do not use it to identify a deploy.
 */
healthRouter.get('/version', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    commit: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'unknown',
    branch: process.env['RAILWAY_GIT_BRANCH'] ?? 'unknown',
    builtAt: readBuiltAt(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});
