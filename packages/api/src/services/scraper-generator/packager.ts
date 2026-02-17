import type { IGeneratedScraper } from './ai-generator';
import type { IScraperCode } from './scraper-code-resolver';

export type TargetOS = 'mac' | 'windows';

export interface IUserCredentials {
  readonly studentName: string;
  readonly username: string;
  readonly password: string;
}

export interface IPackageOptions {
  readonly connectorToken: string;
  readonly apiBaseUrl: string;
  readonly platformName: string;
  readonly loginUrl: string;
  readonly scraper: IGeneratedScraper;
  readonly os: TargetOS;
  readonly credentials?: IUserCredentials;
  readonly generatedAt?: string;
  readonly cacheKey?: string;
}

/**
 * Generates a single self-contained script file that the user double-clicks.
 * Mac: .command file (opens in Terminal)
 * Windows: .bat file (opens in Command Prompt)
 *
 * The script:
 * 1. Installs Node.js if missing
 * 2. Creates a working directory with all scraper files
 * 3. Installs npm dependencies (playwright, etc.)
 * 4. Runs the interactive scraper (visible browser, credential prompts, upload)
 */
export function packageSingleFile(options: IPackageOptions): string {
  if (options.os === 'windows') {
    return generateWindowsBat(options);
  }
  return generateMacCommand(options);
}

// ---------------------------------------------------------------------------
// Multi-student, multi-platform: one script, master run.js iterates all
// ---------------------------------------------------------------------------

export interface IStudentPlatformSlot {
  readonly studentId: string;
  readonly studentName: string;
  readonly platform: string;
  readonly loginUrl: string;
  readonly credentials: IUserCredentials;
  readonly scraperId?: string | null;
}

export interface IPackageMultiOptions {
  readonly connectorToken: string;
  readonly apiBaseUrl: string;
  readonly os: TargetOS;
  readonly students: ReadonlyArray<{
    readonly studentId: string;
    readonly studentName: string;
    readonly platforms: ReadonlyArray<IStudentPlatformSlot>;
  }>;
}

/**
 * Generates one script that runs all students and platforms in sequence.
 */
export function packageMultiStudent(options: IPackageMultiOptions): string {
  if (options.os === 'windows') {
    return generateWindowsBatMulti(options);
  }
  return generateMacCommandMulti(options);
}

// ---------------------------------------------------------------------------
// Bundle: connection-centric, one script, run connections in parallel
// ---------------------------------------------------------------------------

export interface IFileEntry {
  readonly filename: string;
  readonly content: string;
}

/** Connection slot for bundle (no scraper code yet; resolved by API). */
export interface IBundleConnectionSlot {
  readonly platformId: string;
  readonly platformName: string;
  readonly loginUrl: string;
  readonly scraperId?: string | null;
  readonly credentials: {
    readonly username: string;
    readonly password: string;
    readonly studentNameHint?: string;
  };
}

/** Resolved connection with scraper code embedded (used by packager after resolve). */
export interface IResolvedBundleConnection extends IBundleConnectionSlot {
  readonly scraper: IScraperCode;
}

export interface IPackageBundleOptions {
  readonly connectorToken: string;
  readonly apiBaseUrl: string;
  readonly os: TargetOS;
  readonly connections: ReadonlyArray<IResolvedBundleConnection>;
}

/**
 * Pure function: build list of files to embed in the bundle script.
 * Used by generateMacCommandBundle / generateWindowsBatBundle to emit scraper-{platformId}.ts, etc.
 */
export function emitBundleFiles(
  connections: ReadonlyArray<IResolvedBundleConnection>,
  opts: { apiBaseUrl: string; connectorToken: string }
): IFileEntry[] {
  const files: IFileEntry[] = [];
  for (const c of connections) {
    files.push({ filename: `scraper-${c.platformId}.ts`, content: c.scraper.scraperCode });
    files.push({ filename: `transformer-${c.platformId}.ts`, content: c.scraper.transformerCode });
    files.push({ filename: `metadata-${c.platformId}.json`, content: c.scraper.metadata });
  }
  const payload = {
    apiBaseUrl: opts.apiBaseUrl,
    connectorToken: opts.connectorToken,
    connections: connections.map((c) => ({
      platformId: c.platformId,
      platformName: c.platformName,
      loginUrl: c.loginUrl,
      credentials: c.credentials,
    })),
  };
  files.push({ filename: 'payload.json', content: JSON.stringify(payload, null, 2) });
  files.push({
    filename: 'package.json',
    content: JSON.stringify(
      {
        name: 'scholaracle-scraper',
        private: true,
        scripts: { start: 'node run.js' },
        dependencies: {
          playwright: '^1.48.0',
          axios: '^1.7.0',
          'ts-node': '^10.9.0',
          typescript: '^5.0.0',
        },
      },
      null,
      2
    ),
  });
  files.push({
    filename: 'tsconfig.json',
    content: JSON.stringify(
      { compilerOptions: { target: 'ES2020', module: 'commonjs', esModuleInterop: true }, include: ['*.ts', 'run.js'] },
      null,
      2
    ),
  });
  return files;
}

/**
 * Generates one script that runs all connections in parallel (concurrency 3).
 * Each connection: login → discover students (future) → scrape → upload envelope.
 */
export function packageBundle(options: IPackageBundleOptions): string {
  if (options.os === 'windows') {
    return generateWindowsBatBundle(options);
  }
  return generateMacCommandBundle(options);
}

function getBundleRunJs(): string {
  return `const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axios = require('axios');

const APP_DIR = __dirname;
const payloadPath = path.join(APP_DIR, 'payload.json');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

const CONCURRENCY = 3;

async function runConnection(conn, client) {
  const creds = conn.credentials;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(conn.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const emailSel = 'input[type="email"], input[name="email"], input[name="username"]';
    const passSel = 'input[type="password"]';
    const submitSel = 'button[type="submit"], input[type="submit"]';
    if (await page.$(emailSel)) await page.fill(emailSel, creds.username || '');
    if (await page.$(passSel)) await page.fill(passSel, creds.password || '');
    if (await page.$(submitSel)) await page.click(submitSel);
    await page.waitForTimeout(3000);
    const sourceId = (conn.platformId || conn.platformName || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const runRes = await client.post('/api/ingest/v1/runs', { sourceId });
    const runId = runRes.data.runId;
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: { runId, startedAt: new Date().toISOString(), provider: sourceId, adapterId: sourceId + '-browser', adapterVersion: '1.0.0', mode: 'delta', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      source: { sourceId: conn.platformId || conn.platformName, displayName: conn.platformName, portalBaseUrl: conn.loginUrl },
      ops: [],
    };
    await client.post('/api/ingest/v1/runs/' + runId + '/envelope', envelope);
    await client.post('/api/ingest/v1/runs/' + runId + '/complete', {});
    return { ok: true };
  } finally {
    await browser.close();
  }
}

async function runInBatches(arr, fn, limit) {
  const results = [];
  for (let i = 0; i < arr.length; i += limit) {
    const batch = arr.slice(i, i + limit);
    const batchResults = await Promise.all(batch.map((item) => fn(item)));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  console.log('\\n  Scholaracle Data Sync (Bundle)\\n');
  const client = axios.create({
    baseURL: payload.apiBaseUrl,
    headers: { Authorization: 'Bearer ' + payload.connectorToken },
    timeout: 30000,
  });
  let total = 0;
  const results = await runInBatches(payload.connections, async (conn) => {
    console.log('  ' + conn.platformName + ' (' + conn.loginUrl + ')');
    try {
      await runConnection(conn, client);
      console.log('    ✓');
      return 1;
    } catch (err) {
      console.log('    ✗ ' + (err.message || err));
      return 0;
    }
  }, CONCURRENCY);
  total = results.reduce((a, b) => a + b, 0);
  console.log('\\n  Done. ' + total + ' connection(s) synced.\\n');
}

main().catch(err => { console.error(err); process.exit(1); });
`;
}

/** Connection summary for generating bundle run.js (which files to load, lifecycle). */
export interface IBundleRunnerConnection {
  readonly platformId: string;
  readonly platformName: string;
}

/**
 * Generates run.js for the bundle flow: ts-node, per-connection scraper load, full BaseScraper lifecycle
 * (initialize → authenticate → discoverStudents → switchToStudent → scrape → transform), ingest API.
 */
export function generateBundleRunJs(
  connections: ReadonlyArray<IBundleRunnerConnection>
): string {
  if (connections.length === 0) {
    return getBundleRunJs();
  }
  const loadComment = connections.map((c) => 'scraper-' + c.platformId + '.ts').join(', ');
  return `require('ts-node/register');
// Loads per-connection: ${loadComment}
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const APP_DIR = __dirname;
const payload = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'payload.json'), 'utf-8'));
const CONCURRENCY = 3;

function runInBatches(arr, fn, limit) {
  return (async function () {
    const results = [];
    for (let i = 0; i < arr.length; i += limit) {
      const batch = arr.slice(i, i + limit);
      const batchResults = await Promise.all(batch.map((item) => fn(item)));
      results.push(...batchResults);
    }
    return results;
  })();
}

async function runConnection(conn, client) {
  const scraperPath = path.join(APP_DIR, 'scraper-' + conn.platformId + '.ts');
  const mod = require(scraperPath);
  const ScraperClass = mod.default || Object.values(mod).find(function (v) {
    return typeof v === 'function' && v.prototype && typeof v.prototype.initialize === 'function';
  });
  if (!ScraperClass || typeof ScraperClass.prototype.initialize !== 'function') {
    throw new Error('Scraper must export a class with initialize/authenticate/scrape/transform');
  }
  const instance = new ScraperClass();
  const scraperConfig = {
    credentials: {
      username: conn.credentials.username || '',
      password: conn.credentials.password || '',
      studentNameHint: conn.credentials.studentNameHint,
    },
    loginUrl: conn.loginUrl,
    platformName: conn.platformName,
    headless: true,
  };
  await instance.initialize(scraperConfig);
  await instance.authenticate();
  let students = [{ externalId: 'default', name: 'Default' }];
  if (typeof instance.discoverStudents === 'function') {
    const discovered = await instance.discoverStudents();
    if (Array.isArray(discovered) && discovered.length > 0) students = discovered;
  }
  const allOps = [];
  for (const student of students) {
    if (typeof instance.switchToStudent === 'function') {
      await instance.switchToStudent(student);
    }
    let rawData;
    try {
      rawData = await instance.scrape();
    } catch (e) {
      continue;
    }
    let ops = [];
    if (rawData != null && typeof instance.transform === 'function') {
      ops = instance.transform(rawData) || [];
    }
    const studentExternalId = student && (student.externalId || student.id);
    if (studentExternalId && Array.isArray(ops)) {
      ops = ops.map(function (op) {
        const o = Object.assign({}, op);
        o.studentExternalId = studentExternalId;
        return o;
      });
    }
    allOps.push(...ops);
  }
  if (typeof instance.cleanup === 'function') await instance.cleanup();
  const sourceId = (conn.platformId || conn.platformName || 'custom').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const runRes = await client.post('/api/ingest/v1/runs', { sourceId });
  const runId = runRes.data.runId;
  const envelope = {
    schemaVersion: 'slc.ingest.v1',
    run: {
      runId,
      startedAt: new Date().toISOString(),
      provider: sourceId,
      adapterId: sourceId + '-browser',
      adapterVersion: '1.0.0',
      mode: 'delta',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    source: {
      sourceId: conn.platformId || conn.platformName,
      displayName: conn.platformName,
      portalBaseUrl: conn.loginUrl,
    },
    ops: Array.isArray(allOps) ? allOps : [],
  };
  await client.post('/api/ingest/v1/runs/' + runId + '/envelope', envelope);
  await client.post('/api/ingest/v1/runs/' + runId + '/complete', {});
  return { ok: true, count: allOps.length };
}

async function main() {
  console.log('\\n  Scholaracle Data Sync (Bundle)\\n');
  const client = axios.create({
    baseURL: payload.apiBaseUrl,
    headers: { Authorization: 'Bearer ' + payload.connectorToken },
    timeout: 30000,
  });
  const results = await runInBatches(payload.connections, async (conn) => {
    console.log('  ' + conn.platformName + ' (' + conn.loginUrl + ')');
    try {
      const r = await runConnection(conn, client);
      console.log('    ✓');
      return r;
    } catch (err) {
      console.log('    ✗ ' + (err.message || err));
      return { ok: false };
    }
  }, CONCURRENCY);
  const total = results.filter(function (r) { return r && r.ok; }).length;
  console.log('\\n  Done. ' + total + ' connection(s) synced.\\n');
}

main().catch(function (err) { console.error(err); process.exit(1); });
`;
}

function generateMacCommandBundle(opts: IPackageBundleOptions): string {
  const appDir = '$HOME/.scholaracle-scraper';
  const files = emitBundleFiles(opts.connections, {
    apiBaseUrl: opts.apiBaseUrl,
    connectorToken: opts.connectorToken,
  });
  const runJsContent = generateBundleRunJs(
    opts.connections.map((c) => ({ platformId: c.platformId, platformName: c.platformName }))
  );
  const allFiles: IFileEntry[] = [...files, { filename: 'run.js', content: runJsContent }];
  const fileWrites = allFiles
    .map((f) => {
      const filePath = `$APP_DIR/${f.filename}`;
      return writeEmbeddedFile(filePath, f.content);
    })
    .join('\n');
  const chmodPayload =
    files.some((f) => f.filename === 'payload.json') &&
    'chmod 600 "$APP_DIR/payload.json"';
  return `#!/bin/bash
set -e
APP_DIR="${appDir}"
mkdir -p "$APP_DIR"
${fileWrites}
${chmodPayload ? chmodPayload + '\n' : ''}if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "  Setting up (first time only)..."
  cd "$APP_DIR" && npm install --silent 2>/dev/null && npx playwright install chromium 2>/dev/null
  echo "  ✓ Ready"
fi
cd "$APP_DIR"
node run.js
echo ""
echo "  Press Enter to close."
read -r
`;
}

function generateWindowsBatBundle(opts: IPackageBundleOptions): string {
  const appDir = '%USERPROFILE%\\.scholaracle-scraper';
  const files = emitBundleFiles(opts.connections, {
    apiBaseUrl: opts.apiBaseUrl,
    connectorToken: opts.connectorToken,
  });
  const runJsContent = generateBundleRunJs(
    opts.connections.map((c) => ({ platformId: c.platformId, platformName: c.platformName }))
  );
  const allFiles: IFileEntry[] = [...files, { filename: 'run.js', content: runJsContent }];
  const filesData = allFiles.map((f) => ({
    n: f.filename,
    c: Buffer.from(f.content, 'utf-8').toString('base64'),
  }));
  const nodeScript = `const fs=require('fs');const p=require('path');const d=process.env.APP_DIR;if(d){const files=${JSON.stringify(filesData)};files.forEach(function(f){fs.writeFileSync(p.join(d,f.n),Buffer.from(f.c,'base64').toString('utf8'));});}`;
  const nodeScriptEscaped = nodeScript.replace(/"/g, '\\"');
  return `@echo off
chcp 65001 >nul
set "APP_DIR=${appDir}"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"
node -e "${nodeScriptEscaped}"
if not exist "%APP_DIR%\\node_modules" (
  echo   Setting up first time only...
  cd /d "%APP_DIR%"
  call npm install --silent 2>nul
  call npx playwright install chromium 2>nul
  echo   Ready
)
cd /d "%APP_DIR%"
node run.js
echo.
pause
`;
}

function getMultiRunJs(): string {
  return `const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const axios = require('axios');
const readlineSync = require('readline-sync');

const APP_DIR = __dirname;
const payloadPath = path.join(APP_DIR, 'payload.json');
const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));

async function runSlot(student, platform, client) {
  const creds = platform.credentials;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  try {
    await page.goto(platform.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const emailSel = 'input[type="email"], input[name="email"], input[name="username"]';
    const passSel = 'input[type="password"]';
    const submitSel = 'button[type="submit"], input[type="submit"]';
    if (await page.$(emailSel)) await page.fill(emailSel, creds.username || '');
    if (await page.$(passSel)) await page.fill(passSel, creds.password || '');
    if (await page.$(submitSel)) await page.click(submitSel);
    await page.waitForTimeout(3000);
    const runRes = await client.post('/api/ingest/v1/runs', { sourceId: platform.platform.toLowerCase().replace(/[^a-z0-9]+/g, '-') });
    const runId = runRes.data.runId;
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: { runId, startedAt: new Date().toISOString(), provider: platform.platform.toLowerCase().replace(/[^a-z0-9]+/g, '-'), adapterId: platform.platform + '-browser', adapterVersion: '1.0.0', mode: 'delta', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      source: { sourceId: platform.platform, displayName: platform.platform, portalBaseUrl: platform.loginUrl },
      ops: [],
    };
    await client.post('/api/ingest/v1/runs/' + runId + '/envelope', envelope);
    await client.post('/api/ingest/v1/runs/' + runId + '/complete', {});
    return { ok: true };
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('\\n  Scholaracle Data Sync\\n');
  const client = axios.create({
    baseURL: payload.apiBaseUrl,
    headers: { Authorization: 'Bearer ' + payload.connectorToken },
    timeout: 30000,
  });
  let total = 0;
  for (const student of payload.students) {
    console.log('  Student: ' + student.studentName);
    for (const platform of student.platforms) {
      console.log('  ▸ ' + platform.platform + ' (' + platform.loginUrl + ')');
      try {
        await runSlot(student, platform, client);
        console.log('    ✓');
        total++;
      } catch (err) {
        console.log('    ✗ ' + (err.message || err));
      }
    }
  }
  console.log('\\n  Done. ' + total + ' source(s) synced.\\n');
}

main().catch(err => { console.error(err); process.exit(1); });
`;
}

function generateMacCommandMulti(opts: IPackageMultiOptions): string {
  const appDir = '$HOME/.scholaracle-scraper';
  const payloadJson = JSON.stringify({
    apiBaseUrl: opts.apiBaseUrl,
    connectorToken: opts.connectorToken,
    students: opts.students.map((s) => ({
      studentId: s.studentId,
      studentName: s.studentName,
      platforms: s.platforms.map((p) => ({
        platform: p.platform,
        loginUrl: p.loginUrl,
        credentials: p.credentials,
      })),
    })),
  }).replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  const runJsContent = getMultiRunJs();
  return `#!/bin/bash
set -e
APP_DIR="${appDir}"
mkdir -p "$APP_DIR"
echo '${payloadJson}' > "$APP_DIR/payload.json"
cat > "$APP_DIR/run.js" << 'RUNJSEOF'
${runJsContent}
RUNJSEOF
if [ ! -f "$APP_DIR/package.json" ]; then
  echo "  Setting up (first time only)..."
  cat > "$APP_DIR/package.json" << 'PKGEOF'
{"name":"scholaracle-scraper","private":true,"scripts":{"start":"node run.js"},"dependencies":{"playwright":"^1.48.0","axios":"^1.7.0","readline-sync":"^1.4.10"}}
PKGEOF
  cd "$APP_DIR" && npm install --silent 2>/dev/null && npx playwright install chromium 2>/dev/null
  echo "  ✓ Ready"
fi
cd "$APP_DIR"
node run.js
echo ""
echo "  Press Enter to close."
read -r
`;
}

function generateWindowsBatMulti(opts: IPackageMultiOptions): string {
  const appDir = '%USERPROFILE%\\.scholaracle-scraper';
  const payloadJson = JSON.stringify({
    apiBaseUrl: opts.apiBaseUrl,
    connectorToken: opts.connectorToken,
    students: opts.students.map((s) => ({
      studentId: s.studentId,
      studentName: s.studentName,
      platforms: s.platforms.map((p) => ({
        platform: p.platform,
        loginUrl: p.loginUrl,
        credentials: p.credentials,
      })),
    })),
  });
  const runJsB64 = Buffer.from(getMultiRunJs(), 'utf-8').toString('base64');
  const payloadB64 = Buffer.from(payloadJson, 'utf-8').toString('base64');
  return `@echo off
chcp 65001 >nul
set "APP_DIR=${appDir}"
if not exist "%APP_DIR%" mkdir "%APP_DIR%"
node -e "const fs=require('fs');const p=require('path');const d=process.env.APP_DIR||'';if(d){fs.writeFileSync(p.join(d,'payload.json'),Buffer.from('${payloadB64}','base64').toString());fs.writeFileSync(p.join(d,'run.js'),Buffer.from('${runJsB64}','base64').toString());}"
if not exist "%APP_DIR%\\package.json" (
  echo   Setting up first time only...
  cd /d "%APP_DIR%"
  call npm install --silent 2>nul
  call npx playwright install chromium 2>nul
  echo   Ready
)
cd /d "%APP_DIR%"
node run.js
echo.
pause
`;
}


// ---------------------------------------------------------------------------
// Mac .command file
// ---------------------------------------------------------------------------

function generateMacCommand(opts: IPackageOptions): string {
  const platformId = opts.platformName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const appDir = `$HOME/.scholaracle-scraper/app-${platformId}`;

  return `#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Scholaracle Scraper for ${opts.platformName}
# Generated for your account — do not share this file.
# Double-click to run. Requires internet connection.
# ═══════════════════════════════════════════════════════════════

set -e

APP_DIR="${appDir}"
FIRST_RUN=false

echo ""
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║  Scholaracle Scraper for ${opts.platformName.padEnd(24)}║"
echo "  ╚══════════════════════════════════════════════════╝"
echo ""

# ─── Step 0: Check/install Node.js ───────────────────────────
if ! command -v node &> /dev/null; then
  echo "  Installing Node.js (required, one-time)..."
  if command -v brew &> /dev/null; then
    brew install node 2>/dev/null
  else
    echo "  Installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" </dev/null
    eval "$(/opt/homebrew/bin/brew shellenv 2>/dev/null || /usr/local/bin/brew shellenv 2>/dev/null)"
    brew install node
  fi
  echo "  ✓ Node.js installed"
fi
echo "  ✓ Node.js $(node -v)"

# ─── Step 1: Set up app directory ────────────────────────────
if [ ! -f "$APP_DIR/package.json" ]; then
  FIRST_RUN=true
  echo "  Setting up (first time only)..."
  mkdir -p "$APP_DIR"

  # Write package.json
  cat > "$APP_DIR/package.json" << 'PKGJSONEOF'
{
  "name": "scholaracle-scraper-${platformId}",
  "private": true,
  "scripts": { "start": "node run.js" },
  "dependencies": {
    "playwright": "^1.48.0",
    "axios": "^1.7.0",
    "readline-sync": "^1.4.10",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.0"
  }
}
PKGJSONEOF

  # Write config with token, metadata, and credentials
  cat > "$APP_DIR/config.json" << 'CONFIGEOF'
{
  "apiBaseUrl": "${opts.apiBaseUrl}",
  "connectorToken": "${opts.connectorToken}",
  "platformName": "${opts.platformName}",
  "loginUrl": "${opts.loginUrl}",
  "scraperGeneratedAt": "${opts.generatedAt ?? new Date().toISOString()}",
  "scraperCacheKey": "${opts.cacheKey ?? ''}",
  "scraperExpiresAt": "${new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString()}"
}
CONFIGEOF

  # Write credentials (stays local, never uploaded)
  cat > "$APP_DIR/credentials.json" << 'CREDSEOF'
{
  "studentName": "${opts.credentials?.studentName ?? ''}",
  "username": "${opts.credentials?.username ?? ''}",
  "password": "${opts.credentials?.password ?? ''}"
}
CREDSEOF

  # Write scraper files
${writeEmbeddedFile(`$APP_DIR/scraper.ts`, opts.scraper.scraperCode)}

${writeEmbeddedFile(`$APP_DIR/transformer.ts`, opts.scraper.transformerCode)}

${writeEmbeddedFile(`$APP_DIR/metadata.json`, opts.scraper.metadata)}

  # Write tsconfig for ts-node (compile scraper.ts / transformer.ts)
  cat > "$APP_DIR/tsconfig.json" << 'TSCONFIGEOF'
{"compilerOptions":{"module":"commonjs","target":"ES2020","esModuleInterop":true,"resolveJsonModule":true},"include":["*.ts"]}
TSCONFIGEOF

  # Write the run.js entry point
${writeEmbeddedFile(`$APP_DIR/run.js`, generateRunJs(opts))}

  # Install dependencies
  echo "  Installing dependencies..."
  cd "$APP_DIR"
  npm install --silent 2>/dev/null
  echo "  ✓ Dependencies installed"

  # Install Chromium browser
  echo "  Installing browser engine..."
  npx playwright install chromium 2>/dev/null
  echo "  ✓ Browser ready"
  echo ""
else
  cd "$APP_DIR"
fi

# ─── Step 2: Run the scraper ─────────────────────────────────
node run.js

echo ""
echo "  Press Enter to close this window."
read -r
`;
}

// ---------------------------------------------------------------------------
// Windows .bat file
// ---------------------------------------------------------------------------

function generateWindowsBat(opts: IPackageOptions): string {
  const platformId = opts.platformName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const appDir = `%USERPROFILE%\\.scholaracle-scraper\\app-${platformId}`;

  return `@echo off
chcp 65001 >nul
title Scholaracle Scraper for ${opts.platformName}

echo.
echo   ════════════════════════════════════════════════════
echo     Scholaracle Scraper for ${opts.platformName}
echo   ════════════════════════════════════════════════════
echo.

REM ─── Check Node.js ─────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
  echo   Node.js is not installed.
  echo   Please download and install from: https://nodejs.org/
  echo   Then double-click this file again.
  pause
  exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do echo   ✓ Node.js %%i

REM ─── Set up app directory ──────────────────────────────
set "APP_DIR=${appDir}"
if not exist "%APP_DIR%\\package.json" (
  echo   Setting up ^(first time only^)...
  mkdir "%APP_DIR%" 2>nul

  REM Write files using PowerShell for reliability with special characters
  powershell -Command "[System.IO.File]::WriteAllText('%APP_DIR%\\config.json', '${escapeForPowerShell(JSON.stringify({ apiBaseUrl: opts.apiBaseUrl, connectorToken: opts.connectorToken, platformName: opts.platformName, loginUrl: opts.loginUrl, scraperGeneratedAt: opts.generatedAt ?? new Date().toISOString(), scraperCacheKey: opts.cacheKey ?? '', scraperExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() }, null, 2))}', [System.Text.Encoding]::UTF8)"

  powershell -Command "[System.IO.File]::WriteAllText('%APP_DIR%\\credentials.json', '${escapeForPowerShell(JSON.stringify({ studentName: opts.credentials?.studentName ?? '', username: opts.credentials?.username ?? '', password: opts.credentials?.password ?? '' }, null, 2))}', [System.Text.Encoding]::UTF8)"

  powershell -Command "[System.IO.File]::WriteAllText('%APP_DIR%\\package.json', '${escapeForPowerShell(JSON.stringify({ name: `scholaracle-scraper-${platformId}`, private: true, scripts: { start: 'node run.js' }, dependencies: { playwright: '^1.48.0', axios: '^1.7.0', 'readline-sync': '^1.4.10', 'ts-node': '^10.9.2', typescript: '^5.3.0' } }, null, 2))}', [System.Text.Encoding]::UTF8)"

  powershell -Command "[System.IO.File]::WriteAllText('%APP_DIR%\\metadata.json', '${escapeForPowerShell(opts.scraper.metadata)}', [System.Text.Encoding]::UTF8)"

  powershell -Command "[System.IO.File]::WriteAllText('%APP_DIR%\\tsconfig.json', '{\"compilerOptions\":{\"module\":\"commonjs\",\"target\":\"ES2020\",\"esModuleInterop\":true,\"resolveJsonModule\":true},\"include\":[\"*.ts\"]}', [System.Text.Encoding]::UTF8)"

  powershell -Command "[System.IO.File]::WriteAllText('%APP_DIR%\\scraper.ts', '${escapeForPowerShell(opts.scraper.scraperCode)}', [System.Text.Encoding]::UTF8)"

  powershell -Command "[System.IO.File]::WriteAllText('%APP_DIR%\\transformer.ts', '${escapeForPowerShell(opts.scraper.transformerCode)}', [System.Text.Encoding]::UTF8)"

  powershell -Command "[System.IO.File]::WriteAllText('%APP_DIR%\\run.js', '${escapeForPowerShell(generateRunJs(opts))}', [System.Text.Encoding]::UTF8)"

  REM Install dependencies
  echo   Installing dependencies...
  cd /d "%APP_DIR%"
  call npm install --silent 2>nul
  echo   ✓ Dependencies installed

  echo   Installing browser engine...
  call npx playwright install chromium 2>nul
  echo   ✓ Browser ready
  echo.
) else (
  cd /d "%APP_DIR%"
)

REM ─── Run the scraper ───────────────────────────────────
node run.js

echo.
echo   Press any key to close this window.
pause >nul
`;
}

// ---------------------------------------------------------------------------
// run.js — Interactive entry point; loads and runs generated scraper.ts
// ---------------------------------------------------------------------------

function generateRunJs(opts: IPackageOptions): string {
  const platformId = opts.platformName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `#!/usr/bin/env node
/**
 * Scholaracle Scraper Runner for ${opts.platformName}
 * Loads generated scraper.ts + transformer.ts and syncs data to your account.
 * Use --scheduled when run by the OS (no prompts, headless).
 */

const axios = require('axios');
const readlineSync = require('readline-sync');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const os = require('os');

const IS_SCHEDULED = process.argv.includes('--scheduled');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
const CREDS_PATH = path.join(__dirname, 'credentials.json');
const SOURCE_ID = '${platformId}';
const ADAPTER_ID = SOURCE_ID + '-browser';

function log(msg) {
  if (IS_SCHEDULED && logStream) {
    logStream.write(new Date().toISOString() + ' ' + msg + '\\n');
  }
  if (!IS_SCHEDULED) console.log(msg);
}

let logStream = null;
if (IS_SCHEDULED) {
  const logDir = path.join(os.homedir(), '.scholaracle-scraper', 'logs');
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, 'app-${platformId}-' + new Date().toISOString().slice(0, 10) + '.log');
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
  } catch (e) {}
}

async function main() {
  if (!IS_SCHEDULED && CONFIG.scraperGeneratedAt) {
    const generatedAt = new Date(CONFIG.scraperGeneratedAt);
    const daysOld = Math.floor((Date.now() - generatedAt.getTime()) / (24 * 60 * 60 * 1000));
    const dateStr = generatedAt.toLocaleDateString();
    if (daysOld > 180) {
      console.log('  \\u26A0 WARNING: Scraper is ' + daysOld + ' days old (generated ' + dateStr + ')');
      console.log('    Visit https://scholarmancy.com/dashboard to regenerate.');
      console.log('');
    } else if (daysOld > 90) {
      console.log('  \\u26A0 Scraper: Generated ' + dateStr + ' (' + daysOld + ' days ago) — may be outdated');
      console.log('');
    } else {
      console.log('  \\u2714 Scraper: Generated ' + dateStr + ' (' + daysOld + ' days ago)');
    }
  }

  let creds;
  if (fs.existsSync(CREDS_PATH)) {
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf-8'));
    if (!IS_SCHEDULED) {
      console.log('');
      console.log('  Student: ' + creds.studentName);
      console.log('  Login:   ' + creds.username);
      console.log('');
    }
  } else {
    if (IS_SCHEDULED) {
      log('Credentials not found. Run the script interactively once to save credentials.');
      process.exit(1);
    }
    console.log('');
    console.log('  Credentials not found. Please enter:');
    const studentName = readlineSync.question('  Student name: ');
    const username = readlineSync.question('  Email/Username: ');
    const password = readlineSync.question('  Password: ', { hideEchoBack: true, mask: '*' });
    creds = { studentName, username, password };
    fs.writeFileSync(CREDS_PATH, JSON.stringify(creds, null, 2), 'utf-8');
    console.log('');
  }

  const isFirstRun = !fs.existsSync(path.join(__dirname, '.last-run'));
  const scraperConfig = {
    credentials: creds,
    loginUrl: CONFIG.loginUrl,
    platformName: CONFIG.platformName,
    headless: IS_SCHEDULED,
  };

  if (!IS_SCHEDULED) {
    console.log('  Connecting to your school portal...');
    console.log('');
  } else {
    log('Starting scheduled run');
  }

  let ScraperClass;
  try {
    require('ts-node/register');
    const scraperPath = path.join(__dirname, 'scraper.ts');
    const scraperModule = require(scraperPath);
    ScraperClass = scraperModule.default;
    if (!ScraperClass && typeof scraperModule === 'object') {
      const candidates = Object.values(scraperModule).filter(function (v) {
        return typeof v === 'function' && v.prototype && typeof v.prototype.initialize === 'function';
      });
      if (candidates.length) ScraperClass = candidates[0];
    }
    if (!ScraperClass || typeof ScraperClass.prototype.initialize !== 'function') {
      throw new Error('Generated scraper must export a class with initialize/authenticate/scrape/transform/cleanup');
    }
  } catch (loadErr) {
    if (IS_SCHEDULED) {
      log('Failed to load scraper: ' + (loadErr.message || loadErr));
      process.exit(1);
    }
    console.log('');
    console.log('  \\u2717 Could not load generated scraper: ' + (loadErr.message || loadErr));
    console.log('  Ensure ts-node and typescript are installed (npm install in the script folder).');
    process.exit(1);
  }

  const instance = new ScraperClass();
  let rawData;
  let ops = [];

  try {
    await instance.initialize(scraperConfig);
    await instance.authenticate();
    rawData = await instance.scrape();
    if (rawData != null && typeof instance.transform === 'function') {
      ops = instance.transform(rawData) || [];
    }
    if (typeof instance.cleanup === 'function') await instance.cleanup();
  } catch (err) {
    if (IS_SCHEDULED) {
      log('Scraper error: ' + (err.message || err));
      try {
        await axios.post(CONFIG.apiBaseUrl + '/api/integrations/scraper-report', {
          cacheKey: CONFIG.scraperCacheKey || '',
          status: 'failed',
          error: (err.message || String(err)).slice(0, 500),
          generatedAt: CONFIG.scraperGeneratedAt,
        }, { headers: { Authorization: 'Bearer ' + CONFIG.connectorToken }, timeout: 5000 }).catch(function () {});
      } catch (_) {}
      process.exit(1);
    }
    console.log('');
    console.log('  \\u2717 Error: ' + (err.message || err));
    console.log('');
    console.log('  This might happen if:');
    console.log('    - Your school changed their login page');
    console.log('    - Your credentials are incorrect');
    console.log('    - The school portal is temporarily down');
    console.log('');
    console.log('  To fix: Visit your dashboard -> Regenerate Scraper -> Download Fresh Script');
    try {
      await axios.post(CONFIG.apiBaseUrl + '/api/integrations/scraper-report', {
        cacheKey: CONFIG.scraperCacheKey || '',
        status: 'failed',
        error: (err.message || String(err)).slice(0, 500),
        generatedAt: CONFIG.scraperGeneratedAt,
      }, { headers: { Authorization: 'Bearer ' + CONFIG.connectorToken }, timeout: 5000 }).catch(function () {});
    } catch (_) {}
    process.exit(1);
  }

  if (!IS_SCHEDULED) {
    console.log('  Summary: Student ' + creds.studentName + ', ' + (Array.isArray(ops) ? ops.length : 0) + ' operations');
    console.log('');
  } else {
    log('Scraped ' + (Array.isArray(ops) ? ops.length : 0) + ' ops');
  }

  if (isFirstRun && !IS_SCHEDULED) {
    const ok = readlineSync.keyInYNStrict('  Does this look correct?');
    if (!ok) {
      console.log('  Cancelled. No data was uploaded.');
      return;
    }
  }

  const client = axios.create({
    baseURL: CONFIG.apiBaseUrl,
    headers: { Authorization: 'Bearer ' + CONFIG.connectorToken },
    timeout: 30000,
  });

  try {
    const runRes = await client.post('/api/ingest/v1/runs', { sourceId: SOURCE_ID });
    const runId = runRes.data.runId;
    const envelope = {
      schemaVersion: 'slc.ingest.v1',
      run: {
        runId,
        startedAt: new Date().toISOString(),
        provider: SOURCE_ID,
        adapterId: ADAPTER_ID,
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      source: {
        sourceId: SOURCE_ID,
        displayName: CONFIG.platformName,
        portalBaseUrl: CONFIG.loginUrl,
      },
      ops: Array.isArray(ops) ? ops : [],
    };
    await client.post('/api/ingest/v1/runs/' + runId + '/envelope', envelope);
    await client.post('/api/ingest/v1/runs/' + runId + '/complete', {});

    if (!IS_SCHEDULED) {
      console.log('  Syncing to Scholaracle...     \\u2713');
      console.log('  Data synced for ' + creds.studentName + '!');
      console.log('  Check your dashboard: https://scholarmancy.com/dashboard');
    } else {
      log('Upload complete');
    }
  } catch (uploadErr) {
    if (IS_SCHEDULED) {
      log('Upload failed: ' + (uploadErr.message || uploadErr));
      process.exit(1);
    }
    console.log('  \\u2717 Upload failed: ' + (uploadErr.message || uploadErr));
    console.log('  Your data was scraped but not uploaded. Try again later.');
    return;
  }

  fs.writeFileSync(path.join(__dirname, '.last-run'), new Date().toISOString(), 'utf-8');

  if (isFirstRun && !IS_SCHEDULED) {
    console.log('');
    console.log('  Run automatically?');
    const schedule = readlineSync.keyInYNStrict('  Sync your school data 3x daily?');
    if (schedule) {
      setupScheduling();
      console.log('');
      console.log('  \\u2713 Scheduled!  Before school (6:30 AM)');
      console.log('                After school (3:30 PM)');
      console.log('                Evening (8:30 PM)');
    }
  }

  if (logStream) logStream.end();
}

function setupScheduling() {
  const nodePath = process.execPath;
  const runJsPath = path.join(__dirname, 'run.js');
  const platformIdSafe = SOURCE_ID.replace(/[^a-z0-9-]/g, '-');
  const label = 'com.scholaracle.scraper.' + platformIdSafe;

  if (process.platform === 'darwin') {
    const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents');
    const plistPath = path.join(launchAgentsDir, label + '.plist');
    const plist = '<?xml version="1.0" encoding="UTF-8"?>\\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\\n<plist version="1.0">\\n<dict>\\n  <key>Label</key><string>' + label + '</string>\\n  <key>ProgramArguments</key>\\n  <array>\\n    <string>' + nodePath.replace(/&/g, '&amp;') + '</string>\\n    <string>' + runJsPath.replace(/&/g, '&amp;') + '</string>\\n    <string>--scheduled</string>\\n  </array>\\n  <key>WorkingDirectory</key><string>' + __dirname.replace(/&/g, '&amp;') + '</string>\\n  <key>RunAtLoad</key><false/>\\n  <key>StartCalendarInterval</key>\\n  <array>\\n    <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>30</integer></dict>\\n    <dict><key>Hour</key><integer>15</integer><key>Minute</key><integer>30</integer></dict>\\n    <dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>30</integer></dict>\\n  </array>\\n</dict>\\n</plist>\\n';
    try {
      if (!fs.existsSync(launchAgentsDir)) fs.mkdirSync(launchAgentsDir, { recursive: true });
      fs.writeFileSync(plistPath, plist, 'utf-8');
      spawnSync('launchctl', ['load', plistPath], { stdio: 'inherit' });
    } catch (e) {
      console.log('  Could not install schedule: ' + (e.message || e));
    }
    return;
  }

  if (process.platform === 'win32') {
    const trCmd = '"' + nodePath + '" "' + runJsPath + '" --scheduled';
    const tasks = [
      { name: 'Scholaracle Scraper 6:30', time: '06:30' },
      { name: 'Scholaracle Scraper 15:30', time: '15:30' },
      { name: 'Scholaracle Scraper 20:30', time: '20:30' },
    ];
    try {
      for (var i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        spawnSync('schtasks', ['/create', '/tn', t.name, '/tr', trCmd, '/sc', 'daily', '/st', t.time, '/f'], { stdio: 'inherit', windowsHide: true });
      }
    } catch (e) {
      console.log('  Could not install schedule: ' + (e.message || e));
    }
  }
}

main().catch(function (err) {
  if (logStream) logStream.write('Fatal: ' + (err.message || err) + '\\n');
  console.error('Fatal error:', err);
  process.exit(1);
});
`;
}

/** Exported for E2E tests: run.js source for given opts. */
export function getRunJsContent(opts: IPackageOptions): string {
  return generateRunJs(opts);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeEmbeddedFile(filePath: string, content: string): string {
  return `  cat > "${filePath}" << 'EMBEDEOF'
${content}
EMBEDEOF`;
}

function escapeForPowerShell(content: string): string {
  return content.replace(/'/g, "''").replace(/\n/g, '`n');
}
