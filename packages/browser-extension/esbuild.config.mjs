/**
 * Build script for the Scholaracle browser extension.
 *
 * Bundles three entry points:
 *   - background/service-worker.ts → dist/background.js
 *   - content/content-script.ts   → dist/content.js
 *   - popup/popup.ts               → dist/popup.js
 */

import esbuild from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const isWatch = process.argv.includes('--watch');

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

// Copy static assets
for (const f of ['manifest.json', 'popup.html', 'options.html', 'icons/icon-48.png', 'icons/icon-128.png']) {
  try {
    mkdirSync(`dist/${f.includes('/') ? f.split('/')[0] : ''}`, { recursive: true });
    copyFileSync(f, `dist/${f}`);
  } catch {
    // optional assets
  }
}

const contexts = await Promise.all([
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/background.js',
    platform: 'browser',
    format: 'iife',
  }),
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/content/content-script.ts'],
    outfile: 'dist/content.js',
    platform: 'browser',
    format: 'iife',
  }),
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/popup/popup.ts'],
    outfile: 'dist/popup.js',
    platform: 'browser',
    format: 'iife',
  }),
  esbuild.context({
    ...sharedOptions,
    entryPoints: ['src/options/options.ts'],
    outfile: 'dist/options.js',
    platform: 'browser',
    format: 'iife',
  }),
]);

if (isWatch) {
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  console.log('[esbuild] watching...');
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild().then(() => ctx.dispose())));
  console.log('[esbuild] build complete');
  process.exit(0);
}
