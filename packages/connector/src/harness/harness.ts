#!/usr/bin/env node

/**
 * Scholaracle Scrape Test Harness
 *
 * Runs the SAME adapter code used in production against real credentials,
 * then validates the output conforms to the ISlcIngestEnvelopeV1 contract
 * and the data is usable by the application.
 *
 * Usage:
 *   npx ts-node src/harness/harness.ts skyward \
 *     --url "https://skyward.mydistrict.net/scripts/wsisa.dll/WService=wsEAplus/seplog01.w" \
 *     --username student1 \
 *     --password mypass123
 *
 *   npx ts-node src/harness/harness.ts canvas \
 *     --url "https://school.instructure.com" \
 *     --token "my-canvas-token"
 *
 *   npx ts-node src/harness/harness.ts google-classroom \
 *     --token "ya29.oauth-access-token"
 *
 *   npx ts-node src/harness/harness.ts oneroster \
 *     --url "https://sis.district.edu/ims/oneroster/v1p2" \
 *     --token "access-token"
 *
 * Environment variables (alternative to flags):
 *   HARNESS_URL, HARNESS_TOKEN, HARNESS_USERNAME, HARNESS_PASSWORD
 *   HARNESS_CLIENT_ID, HARNESS_CLIENT_SECRET
 *
 * Outputs:
 *   - Human-readable validation report to stdout
 *   - Raw envelope JSON to ./harness-output/<provider>-<timestamp>.json
 *   - Validation report JSON to ./harness-output/<provider>-<timestamp>.report.json
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ILmsAdapter, ILmsCredentials, IConnectionTestResult } from '../adapter';
import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import { CanvasAdapter } from '../canvas/canvas-adapter';
import { GoogleClassroomAdapter } from '../google-classroom/google-classroom-adapter';
import { SkywardAdapter } from '../skyward/skyward-adapter';
import { OneRosterAdapter } from '../oneroster/oneroster-adapter';
import { validateEnvelope, formatReport, type IValidationReport } from './validate-envelope';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

/** Filter out bare '--' that pnpm injects between script args and user args. */
const ARGS = process.argv.filter((a) => a !== '--');

function getArg(name: string): string | undefined {
  const idx = ARGS.indexOf(name);
  if (idx === -1 || idx + 1 >= ARGS.length) return undefined;
  return ARGS[idx + 1];
}

function getEnvOrArg(argName: string, envName: string): string {
  return getArg(argName) ?? process.env[envName] ?? '';
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

function createAdapter(provider: string): ILmsAdapter {
  switch (provider) {
    case 'skyward':
      // For the harness, we use a stub scraper factory that requires
      // the skyward-rest npm package. If not installed, it will fail
      // with a clear message.
      return new SkywardAdapter((loginUrl: string) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const skywardRest = require('skyward-rest');
          return skywardRest(loginUrl);
        } catch {
          throw new Error(
            'skyward-rest is not installed. Run: npm install skyward-rest\n' +
              'This package is required to scrape Skyward portals.'
          );
        }
      });
    case 'canvas':
      return new CanvasAdapter();
    case 'google-classroom':
      return new GoogleClassroomAdapter();
    case 'oneroster':
      return new OneRosterAdapter();
    default:
      throw new Error(
        `Unknown provider: "${provider}". Supported: skyward, canvas, google-classroom, oneroster`
      );
  }
}

function buildCredentials(provider: string): ILmsCredentials {
  const url = getEnvOrArg('--url', 'HARNESS_URL');
  const token = getEnvOrArg('--token', 'HARNESS_TOKEN');
  const username = getEnvOrArg('--username', 'HARNESS_USERNAME');
  const password = getEnvOrArg('--password', 'HARNESS_PASSWORD');
  const clientId = getEnvOrArg('--client-id', 'HARNESS_CLIENT_ID');
  const clientSecret = getEnvOrArg('--client-secret', 'HARNESS_CLIENT_SECRET');

  switch (provider) {
    case 'skyward':
      if (!url) throw new Error('Skyward requires --url (district login URL) or HARNESS_URL');
      if (!username) throw new Error('Skyward requires --username or HARNESS_USERNAME');
      if (!password) throw new Error('Skyward requires --password or HARNESS_PASSWORD');
      return { baseUrl: url, username, password };

    case 'canvas':
      if (!url)
        throw new Error(
          'Canvas requires --url (e.g. https://school.instructure.com) or HARNESS_URL'
        );
      if (!token) throw new Error('Canvas requires --token (API access token) or HARNESS_TOKEN');
      return { baseUrl: url, accessToken: token };

    case 'google-classroom':
      if (!token)
        throw new Error('Google Classroom requires --token (OAuth access token) or HARNESS_TOKEN');
      return { baseUrl: 'https://classroom.googleapis.com', accessToken: token };

    case 'oneroster':
      if (!url) throw new Error('OneRoster requires --url (API base URL) or HARNESS_URL');
      if (!token && (!clientId || !clientSecret)) {
        throw new Error('OneRoster requires --token or --client-id + --client-secret');
      }
      return {
        baseUrl: url,
        accessToken: token || undefined,
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
      };

    default:
      return { baseUrl: url };
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function writeOutput(
  provider: string,
  envelope: ISlcIngestEnvelopeV1,
  report: IValidationReport
): void {
  const outDir = join(process.cwd(), 'harness-output');
  mkdirSync(outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${provider}-${ts}`;

  const envelopePath = join(outDir, `${baseName}.json`);
  writeFileSync(envelopePath, JSON.stringify(envelope, null, 2), 'utf8');

  const reportPath = join(outDir, `${baseName}.report.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('  Files written:');
  console.log(`    Envelope: ${envelopePath}`);
  console.log(`    Report:   ${reportPath}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function printUsage(): void {
  console.log(`
Scholaracle Scrape Test Harness

Usage:
  npx ts-node src/harness/harness.ts <provider> [options]

Providers:
  skyward          Skyward Family Access (scraper)
  canvas           Canvas LMS (REST API)
  google-classroom Google Classroom (REST API)
  oneroster        OneRoster v1.1/v1.2 (REST API)

Options:
  --url <url>              Base URL / portal URL
  --token <token>          API access token / OAuth token
  --username <user>        Username (Skyward)
  --password <pass>        Password (Skyward)
  --client-id <id>         OAuth client ID (OneRoster)
  --client-secret <secret> OAuth client secret (OneRoster)
  --no-save                Don't write output files

Environment variables:
  HARNESS_URL, HARNESS_TOKEN, HARNESS_USERNAME, HARNESS_PASSWORD
  HARNESS_CLIENT_ID, HARNESS_CLIENT_SECRET

Examples:
  # Skyward
  npx ts-node src/harness/harness.ts skyward \\
    --url "https://skyward.district.net/scripts/wsisa.dll/WService=wsEAplus/seplog01.w" \\
    --username student1 --password pass123

  # Canvas
  npx ts-node src/harness/harness.ts canvas \\
    --url "https://school.instructure.com" \\
    --token "your-api-token"
`);
}

async function main(): Promise<void> {
  const provider = ARGS[2];
  if (!provider || provider === '--help' || provider === '-h') {
    printUsage();
    process.exit(provider ? 0 : 1);
  }

  const noSave = ARGS.includes('--no-save');

  console.log(`\n🔬 Scholaracle Scrape Harness — ${provider}`);
  console.log(`   ${new Date().toISOString()}\n`);

  // 1. Build credentials
  let credentials: ILmsCredentials;
  try {
    credentials = buildCredentials(provider);
    console.log('✓ Credentials parsed');
  } catch (err) {
    console.error(`✗ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 2. Create adapter (same code as production)
  const adapter = createAdapter(provider);
  console.log(`✓ Adapter created: ${adapter.meta.displayName} v${adapter.meta.adapterVersion}`);

  // 3. Authenticate
  try {
    await adapter.authenticate(credentials);
    console.log('✓ Authenticated');
  } catch (err) {
    console.error(`✗ Authentication failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 4. Test connection (if adapter supports it)
  const adapterAny = adapter as unknown as Record<string, unknown>;
  if (typeof adapterAny['testConnection'] === 'function') {
    const testResult: IConnectionTestResult = await (
      adapterAny['testConnection'] as () => Promise<IConnectionTestResult>
    )();
    if (testResult.success) {
      console.log(`✓ Connection test: ${testResult.message} (${testResult.durationMs}ms)`);
    } else {
      console.error(`✗ Connection test failed: ${testResult.message}`);
      process.exit(1);
    }
  }

  // 5. Fetch envelope (the actual scrape/API call)
  console.log('\n⏳ Fetching data...\n');
  const start = Date.now();
  let envelope: ISlcIngestEnvelopeV1;
  try {
    envelope = await adapter.fetchEnvelope({
      runId: `harness-${Date.now()}`,
      sourceId: `harness-${provider}`,
      displayName: `Harness Test — ${provider}`,
      portalBaseUrl: credentials.baseUrl,
    });
    console.log(`✓ Envelope fetched (${Date.now() - start}ms)`);
  } catch (err) {
    console.error(`✗ Fetch failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // 6. Validate
  const report = validateEnvelope(envelope, provider, Date.now() - start);
  console.log(formatReport(report));

  // 7. Write output files
  if (!noSave) {
    writeOutput(provider, envelope, report);
  }

  // 8. Exit code
  if (report.summary.errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
