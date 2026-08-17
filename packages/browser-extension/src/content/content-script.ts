/**
 * Content script — runs on portal pages.
 *
 * Waits for a RUN_SYNC message from the service worker, then:
 *   1. Creates a ContentScriptPageDriver (operates on the current page)
 *   2. Calls runClientScrape (extract → transform → validate → upload)
 *   3. Sends SYNC_COMPLETE or SYNC_FAILED back to the service worker
 *
 * Authentication (login) is NOT handled here — the service worker prompts the
 * user to navigate to the portal login page before triggering RUN_SYNC.
 */

import { runClientScrape, SyncError } from '@scholaracle/scraper-core';
import { ExtensionIngestUploader } from '../lib/ingest';
import { ContentScriptPageDriver } from './ContentScriptPageDriver';
import type { IPortalCredential } from '../lib/storage';

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
  const { credential, connectorToken, apiBaseUrl } = msg;
  const {
    provider,
    sourceId,
    adapterId,
    adapterVersion,
    baseUrl,
    studentExternalId,
    institutionExternalId,
  } = credential;

  const driver = new ContentScriptPageDriver();

  try {
    const envelope = await runClientScrape({
      driver,
      config: {
        provider,
        adapterId,
        adapterVersion,
        baseUrl,
        sourceId,
        studentExternalId,
        institutionExternalId,
      },
      clientType: 'browser-extension',
      uploader: new ExtensionIngestUploader(apiBaseUrl, connectorToken),
      onProgress: (p) =>
        chrome.runtime.sendMessage({ type: 'SYNC_PROGRESS', phase: p.phase, message: p.message }),
    });

    chrome.runtime.sendMessage({
      type: 'SYNC_COMPLETE',
      runId: envelope.run.runId,
      opCount: envelope.ops.length,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const requiresLogin =
      err instanceof SyncError
        ? err.phase === 'portal'
        : errorMessage.toLowerCase().includes('login') ||
          errorMessage.toLowerCase().includes('session') ||
          errorMessage.toLowerCase().includes('401') ||
          errorMessage.toLowerCase().includes('unauthorized');

    chrome.runtime.sendMessage({
      type: 'SYNC_FAILED',
      runId: msg.runId,
      errorMessage,
      requiresLogin,
      provider,
      baseUrl,
    });
  }
}
