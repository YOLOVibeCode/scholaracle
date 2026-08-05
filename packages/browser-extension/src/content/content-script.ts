/**
 * Content script — runs on portal pages.
 *
 * Waits for a RUN_SYNC message from the service worker, then:
 *   1. Creates a ContentScriptPageDriver (operates on the current page)
 *   2. Runs the platform recipe via scraper-core
 *   3. Transforms, validates, and uploads the envelope
 *   4. Sends SYNC_COMPLETE or SYNC_FAILED back to the service worker
 */

import {
  runCanvasRecipe,
  runSkywardRecipe,
  runAeriesRecipe,
  transformCanvasExtract,
  transformSkywardExtract,
  transformAeriesExtract,
  validateEnvelope,
} from '@scholaracle/scraper-core';
import { SLC_INGEST_SCHEMA_VERSION_V1, type ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';
import { uploadEnvelope } from '../lib/ingest';
import { ContentScriptPageDriver } from './ContentScriptPageDriver';
import type { IPortalCredential } from '../lib/storage';

const EXTENSION_VERSION = '0.1.0';

interface IRunSyncMessage {
  readonly type: 'RUN_SYNC';
  readonly runId: string;
  readonly credential: IPortalCredential;
  readonly connectorToken: string;
  readonly apiBaseUrl: string;
}

function isRunSyncMessage(v: unknown): v is IRunSyncMessage {
  return typeof v === 'object' && v !== null && (v as { type?: string }).type === 'RUN_SYNC';
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, _sendResponse) => {
  if (!isRunSyncMessage(message)) return false;
  void runSync(message);
  return false;
});

async function runSync(msg: IRunSyncMessage): Promise<void> {
  const { runId, credential, connectorToken, apiBaseUrl } = msg;
  const {
    provider,
    sourceId,
    adapterId,
    baseUrl,
    adapterVersion,
    studentExternalId,
    institutionExternalId,
  } = credential;

  const ctx = { provider, adapterId, studentExternalId, institutionExternalId };
  const driver = new ContentScriptPageDriver();
  let opCount = 0;

  try {
    const now = new Date().toISOString();
    let envelope: ISlcIngestEnvelopeV1;

    if (provider === 'canvas') {
      const raw = await runCanvasRecipe(driver, baseUrl);
      const ops = transformCanvasExtract(raw, ctx);
      opCount = ops.length;
      envelope = buildEnvelope({
        runId,
        now,
        provider,
        adapterId,
        adapterVersion,
        sourceId,
        baseUrl,
        ops,
      });
    } else if (provider === 'skyward') {
      const raw = await runSkywardRecipe(driver, baseUrl);
      const ops = transformSkywardExtract(raw, ctx);
      opCount = ops.length;
      envelope = buildEnvelope({
        runId,
        now,
        provider,
        adapterId,
        adapterVersion,
        sourceId,
        baseUrl,
        ops,
      });
    } else if (provider === 'aeries') {
      const raw = await runAeriesRecipe(driver, baseUrl);
      const ops = transformAeriesExtract(raw, ctx);
      opCount = ops.length;
      envelope = buildEnvelope({
        runId,
        now,
        provider,
        adapterId,
        adapterVersion,
        sourceId,
        baseUrl,
        ops,
      });
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const report = validateEnvelope(envelope);
    if (!report.passed) throw new Error(`Validation failed: ${report.errorCount} errors`);

    await uploadEnvelope(envelope, connectorToken, apiBaseUrl);

    chrome.runtime.sendMessage({
      type: 'SYNC_COMPLETE',
      runId,
      opCount,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const requiresLogin =
      errorMessage.toLowerCase().includes('login') ||
      errorMessage.toLowerCase().includes('session') ||
      errorMessage.toLowerCase().includes('401') ||
      errorMessage.toLowerCase().includes('unauthorized');

    chrome.runtime.sendMessage({
      type: 'SYNC_FAILED',
      runId,
      errorMessage,
      requiresLogin,
      provider,
      baseUrl,
    });
  }
}

function buildEnvelope(params: {
  readonly runId: string;
  readonly now: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly sourceId: string;
  readonly baseUrl: string;
  readonly ops: readonly unknown[];
}): ISlcIngestEnvelopeV1 {
  return {
    schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
    run: {
      runId: params.runId,
      startedAt: params.now,
      endedAt: new Date().toISOString(),
      provider: params.provider,
      adapterId: params.adapterId,
      adapterVersion: params.adapterVersion,
      mode: 'delta',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      meta: {
        clientType: 'browser-extension',
        extensionVersion: EXTENSION_VERSION,
        publisher: 'scholaracle',
      },
    },
    source: {
      sourceId: params.sourceId,
      displayName: `${params.provider} (extension)`,
      portalBaseUrl: params.baseUrl,
    },
    ops: params.ops as ISlcIngestEnvelopeV1['ops'],
  };
}
