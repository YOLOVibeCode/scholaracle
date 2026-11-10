/**
 * Build script for the Scholaracle browser extension.
 *
 * Bundles three entry points:
 *   - background/service-worker.ts → dist/background.js
 *   - content/content-script.ts   → dist/content.js
 *   - popup/popup.ts               → dist/popup.js
 */

import esbuild from 'esbuild';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
const isWatch = process.argv.includes('--watch');
const isE2eBuild = process.env.SCHOLARMANCY_EXTENSION_E2E === '1';

const sharedOptions = {
  bundle: true,
  minify: !isWatch,
  sourcemap: isWatch ? 'inline' : false,
  target: 'chrome120',
  platform: 'browser',
  format: 'iife',
  // contracts pulls node:crypto via Strategy — keep it external for browser bundles
  external: ['node:crypto', 'crypto', 'node:fs', 'node:path', 'fs', 'path'],
  define: { 'process.env.NODE_ENV': JSON.stringify(isWatch ? 'development' : 'production') },
};

mkdirSync('dist', { recursive: true });

const manifestSource = isE2eBuild && existsSync('manifest.e2e.json') ? 'manifest.e2e.json' : 'manifest.json';
copyFileSync(manifestSource, 'dist/manifest.json');

// Copy static assets
for (const f of ['popup.html', 'options.html', 'icons/icon-48.png', 'icons/icon-128.png']) {
  try {
    mkdirSync(`dist/${f.includes('/') ? f.split('/')[0] : ''}`, { recursive: true });
    copyFileSync(f, `dist/${f}`);
  } catch {
    // optional assets
  }
}

/** @type {import('esbuild').BuildOptions[]} */
const entryBuilds = [
  {
    ...sharedOptions,
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/background.js',
  },
  {
    ...sharedOptions,
    entryPoints: ['src/content/content-script.ts'],
    outfile: 'dist/content.js',
  },
  {
    ...sharedOptions,
    entryPoints: ['src/popup/popup.ts'],
    outfile: 'dist/popup.js',
  },
  {
    ...sharedOptions,
    entryPoints: ['src/options/options.ts'],
    outfile: 'dist/options.js',
  },
];

if (isE2eBuild) {
  entryBuilds.push({
    ...sharedOptions,
    entryPoints: ['src/content/e2e-conformance.ts'],
    outfile: 'dist/e2e-conformance.js',
  });
}

const contexts = await Promise.all(entryBuilds.map((opts) => esbuild.context(opts)));

if (isWatch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[esbuild] watching...');
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild().then(() => ctx.dispose())));
  console.log('[esbuild] build complete');
  process.exit(0);
}
