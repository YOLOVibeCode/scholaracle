#!/usr/bin/env node

import { loadConfig, saveConfig } from './config';
import { postJson } from './http';
import { AdapterRegistry } from './adapter-registry';
import { FixtureAdapter } from './fixture-adapter-wrapper';
function usage(): never {
  // eslint-disable-next-line no-console
  console.log(`
Scholaracle Local Connector (SLC)

Usage:
  slc init [--api http://localhost:2801]
  slc approve --user-token <USER_JWT> --user-code <XXXX-XXXX>
  slc add-source --source-id <id> --provider <provider> --adapter-id <id> --display-name <name> [--portal-base-url <url>]
  slc run --source-id <id> [--fixture]

Environment:
  API_BASE_URL (default: http://localhost:2801)
`);
  process.exit(1);
}

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

async function cmdInit(): Promise<void> {
  const apiBaseUrl = getArg('--api') ?? process.env['API_BASE_URL'] ?? loadConfig().apiBaseUrl;
  const cfg = loadConfig();
  saveConfig({ ...cfg, apiBaseUrl });

  const start = await postJson<{
    success: boolean;
    deviceCode: string;
    userCode: string;
    verificationUrl: string;
  }>(`${apiBaseUrl}/api/ingest/v1/device/start`, {});

  // eslint-disable-next-line no-console
  console.log('Device code created.');
  // eslint-disable-next-line no-console
  console.log(`User code: ${start.userCode}`);
  // eslint-disable-next-line no-console
  console.log(
    `Approve it by logging into Scholaracle and visiting: ${apiBaseUrl}${start.verificationUrl}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `(Dev shortcut) Run: slc approve --user-token <USER_JWT> --user-code ${start.userCode}`
  );

  // Poll until approved
  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await postJson<{ success: boolean; status: string; connectorToken?: string }>(
      `${apiBaseUrl}/api/ingest/v1/device/poll`,
      { deviceCode: start.deviceCode }
    );
    if (poll.status === 'approved' && poll.connectorToken) {
      const newCfg = loadConfig();
      saveConfig({
        ...newCfg,
        apiBaseUrl,
        connectorToken: poll.connectorToken,
        sources: newCfg.sources,
      });
      // eslint-disable-next-line no-console
      console.log('Connector token saved locally. ✅');
      return;
    }
    // eslint-disable-next-line no-console
    console.log(`Waiting for approval... (${poll.status})`);
  }
}

async function cmdApprove(): Promise<void> {
  const apiBaseUrl = process.env['API_BASE_URL'] ?? loadConfig().apiBaseUrl;
  const userToken = getArg('--user-token');
  const userCode = getArg('--user-code');
  if (!userToken || !userCode) usage();

  await postJson(`${apiBaseUrl}/api/ingest/v1/device/approve`, { userCode }, userToken);
  // eslint-disable-next-line no-console
  console.log('Approved. You can return to slc init polling.');
}

async function cmdAddSource(): Promise<void> {
  const cfg = loadConfig();
  const token = cfg.connectorToken;
  if (!token) throw new Error('Missing connector token. Run `slc init` first.');

  const sourceId = getArg('--source-id');
  const provider = getArg('--provider');
  const adapterId = getArg('--adapter-id');
  const displayName = getArg('--display-name');
  const portalBaseUrl = getArg('--portal-base-url');
  if (!sourceId || !provider || !adapterId || !displayName) usage();

  await postJson(
    `${cfg.apiBaseUrl}/api/ingest/v1/sources`,
    { sourceId, provider, adapterId, displayName, portalBaseUrl },
    token
  );

  const nextSources = [
    ...cfg.sources.filter((s) => s.sourceId !== sourceId),
    { sourceId, provider, adapterId, displayName, portalBaseUrl },
  ];
  saveConfig({ ...cfg, sources: nextSources });
  // eslint-disable-next-line no-console
  console.log(`Source saved: ${sourceId}`);
}

function createDefaultRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register('fixture', 'com.scholaracle.fixture', () => new FixtureAdapter());
  // Canvas, Skyward, and Aeries now use scholaracle-scraper (Playwright browser scrapers).
  // Use the fixture adapter for local CLI testing.
  return registry;
}

async function cmdRun(): Promise<void> {
  const cfg = loadConfig();
  const token = cfg.connectorToken;
  if (!token) throw new Error('Missing connector token. Run `slc init` first.');

  const sourceId = getArg('--source-id');
  if (!sourceId) usage();

  const source = cfg.sources.find((s) => s.sourceId === sourceId);
  if (!source) throw new Error(`Unknown sourceId ${sourceId}. Run slc add-source first.`);

  const isFixtureMode = process.argv.includes('--fixture');
  const provider = isFixtureMode ? 'fixture' : source.provider;
  const adapterId = isFixtureMode ? 'com.scholaracle.fixture' : source.adapterId;

  const registry = createDefaultRegistry();
  const adapter = registry.create(provider, adapterId, {
    baseUrl: source.portalBaseUrl ?? '',
    accessToken: process.env['CANVAS_ACCESS_TOKEN'],
  });

  const run = await postJson<{ success: boolean; runId: string }>(
    `${cfg.apiBaseUrl}/api/ingest/v1/runs`,
    { sourceId },
    token
  );

  const envelope = await adapter.fetchEnvelope({
    runId: run.runId,
    sourceId,
    displayName: source.displayName,
    portalBaseUrl: source.portalBaseUrl,
  });

  await postJson(`${cfg.apiBaseUrl}/api/ingest/v1/runs/${run.runId}/envelope`, envelope, token);
  await postJson(
    `${cfg.apiBaseUrl}/api/ingest/v1/runs/${run.runId}/complete`,
    { cursor: { type: 'opaque', value: `${provider}-${Date.now()}` } },
    token
  );

  // eslint-disable-next-line no-console
  console.log(`Run complete: ${run.runId}`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (!cmd) usage();

  if (cmd === 'init') return cmdInit();
  if (cmd === 'approve') return cmdApprove();
  if (cmd === 'add-source') return cmdAddSource();
  if (cmd === 'run') return cmdRun();

  usage();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
