/**
 * Back-compat launcher — runs the TypeScript fake portal (packages/e2e/fake-portal).
 * Prefer: pnpm --filter @scholaracle/e2e run fake-portal:start (after fake-portal:build).
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = spawnSync('pnpm', ['--filter', '@scholaracle/e2e', 'run', 'fake-portal:build'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
if (build.status !== 0) process.exit(build.status ?? 1);
const start = spawnSync('pnpm', ['--filter', '@scholaracle/e2e', 'run', 'fake-portal:start'], {
  cwd: root,
  stdio: 'inherit',
  env: process.env,
});
process.exit(start.status ?? 1);
