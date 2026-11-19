const path = require('path');
const { syncCompanionDevSeed } = require('./scripts/companion-dev-seed');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// Writes src/credentials/companionDevSeed.generated.ts on every bundler start. Only the development
// server reads companion.env.local; exports, OTA updates and store builds write the null module.
// The rules are in scripts/companion-dev-seed.js.
try {
  const outcome = syncCompanionDevSeed({ projectRoot, nodeEnv: process.env.NODE_ENV });
  if (outcome === 'skipped') {
    process.stderr.write(
      `[metro.config] companion.env.local not read: NODE_ENV is "${process.env.NODE_ENV}", and the dev sign-in seed is only written by the development server\n`,
    );
  }
} catch (e) {
  // Non-fatal: production EAS builds don't need companion credentials.
  process.stderr.write(
    `[metro.config] syncCompanionDevSeed skipped: ${e?.message}\n`,
  );
}

process.stderr.write(`[metro.config] Node.js: ${process.version} ${process.platform} ${process.arch}\n`);
process.stderr.write(`[metro.config] projectRoot: ${projectRoot}\n`);
process.stderr.write(`[metro.config] workspaceRoot: ${workspaceRoot}\n`);

/** @type {import('expo/metro-config').MetroConfig} */
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(projectRoot);

// === Monorepo watchFolders ===
// Use the full workspaceRoot so Metro can crawl all packages without needing
// per-package path filtering. This avoids Transformer.verifyRootExists()
// throwing on EAS when individual src/ dirs don't exist in the archive.
config.watchFolders = [workspaceRoot];

process.stderr.write(`[metro.config] watchFolders: [workspaceRoot]\n`);
process.stderr.write(`[metro.config] transformerPath: ${config.transformerPath}\n`);

// Explicitly disable Watchman — use Node.js fs API instead. On EAS macOS
// Tahoe images Watchman may be installed but broken, causing fileMap.build()
// to reject and leaving _transformer undefined.
config.resolver.useWatchman = false;

// Alias workspace packages directly to their src/ directories so Metro
// compiles TypeScript on the fly without needing pre-built dist/.
const contractsSrc = path.resolve(projectRoot, '../contracts/src');
const scraperCoreSrc = path.resolve(projectRoot, '../scraper-core/src');
const studioCoreSrc = path.resolve(projectRoot, '../studio-core/src');
const interfacesSrc = path.resolve(projectRoot, '../interfaces/src');
config.resolver.extraNodeModules = {
  '@scholaracle/contracts': contractsSrc,
  '@scholaracle/scraper-core': scraperCoreSrc,
  '@scholaracle/studio-core': studioCoreSrc,
  '@scholaracle/interfaces': interfacesSrc,
};

// Never pull companion secret files into the JS graph
config.resolver.blockList = [
  /(^|[/\\])companion\.env\.local$/,
  /(^|[/\\])\.env\.companion/,
];

// Surface the real init error instead of the confusing downstream TypeError.
// Metro's Bundler.js .catch() fires transformer_load_failed but resolves
// _initializedPromise (leaving _transformer undefined). Rethrowing here
// propagates the actual root cause to every await ready() caller.
const _baseReporter = config.reporter;
config.reporter = {
  ...(_baseReporter || {}),
  update(event) {
    if (event.type === 'transformer_load_failed') {
      const err =
        event.error ?? new Error('Metro transformer failed to load');
      process.stderr.write('\n=== METRO_INIT_FAILURE ===\n');
      process.stderr.write(`message: ${String(err?.message ?? err)}\n`);
      process.stderr.write(`stack:\n${err?.stack ?? '(no stack)'}\n`);
      process.stderr.write('=== END METRO_INIT_FAILURE ===\n\n');
      throw err;
    }
    if (_baseReporter && typeof _baseReporter.update === 'function') {
      _baseReporter.update.call(_baseReporter, event);
    }
  },
};

module.exports = config;
