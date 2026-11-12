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
  const now = new Date().toISOString();
  res.status(200).json({
    status: 'ok',
    ok: true,
    service: 'scholarmancy-api',
    commit:
      process.env['RAILWAY_GIT_COMMIT_SHA'] ??
      process.env['VERCEL_GIT_COMMIT_SHA'] ??
      process.env['GIT_COMMIT'] ??
      'unknown',
    env: process.env['APP_ENV'] ?? process.env['RAILWAY_ENVIRONMENT_NAME'] ?? 'dev',
    timestamp: now,
    utc: now,
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
    nodeVersion: process.version,
    platform: process.platform,
    timestamp: new Date().toISOString(),
  });
});

const DEFAULT_IOS_STORE_URL = 'https://apps.apple.com/app/scholarmancy/id6798499288';
const DEFAULT_ANDROID_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.scholarmancy.app';

/** Dotted numeric version such as `1.2.0`. Anything else disables the gate. */
const VERSION_PATTERN = /^\d+(\.\d+){0,3}$/;

function envText(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Minimum supported mobile app version (force-update gate).
 *
 * Public, unauthenticated, uncached. Unset or malformed `MIN_APP_VERSION`
 * means "no gate": the app treats `minVersion: null` as nothing to enforce,
 * and the app also fails open when this route is unreachable.
 *
 *   MIN_APP_VERSION   e.g. 1.2.0 (compared against the app's marketing version)
 *   MIN_APP_BUILD     optional native build number floor
 *   MIN_APP_MESSAGE   optional text shown on the "Update required" screen
 *   IOS_APP_STORE_URL / ANDROID_PLAY_STORE_URL   override the store links
 */
healthRouter.get('/min-app-version', (_req: Request, res: Response) => {
  const rawMin = envText('MIN_APP_VERSION');
  const minVersion = rawMin && VERSION_PATTERN.test(rawMin) ? rawMin : null;
  const rawBuild = envText('MIN_APP_BUILD');
  const minBuild = minVersion && rawBuild && /^\d+$/.test(rawBuild) ? rawBuild : null;
  res.set('Cache-Control', 'no-store');
  res.status(200).json({
    minVersion,
    minBuild,
    message: minVersion ? envText('MIN_APP_MESSAGE') : null,
    storeUrls: {
      ios: envText('IOS_APP_STORE_URL') ?? DEFAULT_IOS_STORE_URL,
      android: envText('ANDROID_PLAY_STORE_URL') ?? DEFAULT_ANDROID_STORE_URL,
    },
  });
});
