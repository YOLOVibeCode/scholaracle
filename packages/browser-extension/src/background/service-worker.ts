/**
 * Extension service worker (Manifest V3 background).
 *
 * - Schedules periodic syncs via chrome.alarms
 * - On alarm: opens a background tab for each registered portal,
 *   sends a RUN_SYNC message to the content script, and closes the tab
 * - Receives SYNC_COMPLETE / SYNC_FAILED messages from content scripts
 * - Shows desktop notifications on failure (prompts re-login)
 */

import { getConfig, getCredentials, appendRun, updateRunStatus } from '../lib/storage';

const ALARM_NAME = 'slc_sync';
const DEFAULT_PERIOD_MINUTES = 360; // 6 hours

chrome.runtime.onInstalled.addListener(async () => {
  const config = await getConfig();
  const periodMinutes = config?.scheduleHours ? config.scheduleHours * 60 : DEFAULT_PERIOD_MINUTES;
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: periodMinutes });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await runAllSyncs();
});

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isMessage(message)) return false;

  if (message.type === 'SYNC_NOW') {
    void runAllSyncs().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === 'SYNC_COMPLETE') {
    void handleSyncComplete(message as ISyncCompleteMessage);
  }
  if (message.type === 'SYNC_FAILED') {
    void handleSyncFailed(message as ISyncFailedMessage);
  }
  return false;
});

// Reconfigure alarm when config changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes['slc_config']) {
    void (async () => {
      const config = await getConfig();
      if (!config) return;
      await chrome.alarms.clear(ALARM_NAME);
      await chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: config.scheduleHours * 60,
      });
    })();
  }
});

async function runAllSyncs(): Promise<void> {
  const [config, credentials] = await Promise.all([getConfig(), getCredentials()]);
  if (!config || credentials.length === 0) return;

  for (const cred of credentials) {
    const runId = crypto.randomUUID();
    await appendRun({
      runId,
      provider: cred.provider,
      status: 'in_progress',
      startedAt: new Date().toISOString(),
    });

    // Open a background tab to the portal so the content script runs
    const tab = await chrome.tabs.create({ url: cred.baseUrl, active: false });
    if (!tab.id) continue;

    // Give the page time to load, then ask the content script to run the recipe
    await sleep(3000);
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'RUN_SYNC',
        runId,
        credential: cred,
        connectorToken: config.connectorToken,
        apiBaseUrl: config.apiBaseUrl,
      });
    } catch {
      // Content script may not have loaded yet; tab will close anyway
      await chrome.tabs.remove(tab.id).catch(() => undefined);
      await updateRunStatus(runId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        errorMessage: 'Content script not ready — portal may require login',
      });
      await notifyFailure(cred.provider, cred.baseUrl);
    }
  }
}

async function handleSyncComplete(msg: ISyncCompleteMessage): Promise<void> {
  await updateRunStatus(msg.runId, {
    status: 'success',
    completedAt: new Date().toISOString(),
    opCount: msg.opCount,
  });
  if (msg.tabId) await chrome.tabs.remove(msg.tabId).catch(() => undefined);
}

async function handleSyncFailed(msg: ISyncFailedMessage): Promise<void> {
  await updateRunStatus(msg.runId, {
    status: 'failed',
    completedAt: new Date().toISOString(),
    errorMessage: msg.errorMessage,
  });
  if (msg.tabId) await chrome.tabs.remove(msg.tabId).catch(() => undefined);
  if (msg.requiresLogin) {
    await notifyFailure(msg.provider, msg.baseUrl);
  }
}

async function notifyFailure(provider: string, baseUrl: string): Promise<void> {
  await chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title: 'Scholaracle: Login required',
    message: `Your ${provider} session expired. Click to log in again.`,
    buttons: [{ title: 'Open portal' }],
    isClickable: true,
    contextMessage: baseUrl,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Type guards ---

interface IBaseMessage {
  readonly type: string;
}
interface ISyncCompleteMessage extends IBaseMessage {
  readonly type: 'SYNC_COMPLETE';
  readonly runId: string;
  readonly opCount: number;
  readonly tabId?: number;
}
interface ISyncFailedMessage extends IBaseMessage {
  readonly type: 'SYNC_FAILED';
  readonly runId: string;
  readonly errorMessage: string;
  readonly requiresLogin: boolean;
  readonly provider: string;
  readonly baseUrl: string;
  readonly tabId?: number;
}

function isMessage(v: unknown): v is IBaseMessage {
  return typeof v === 'object' && v !== null && 'type' in v;
}
