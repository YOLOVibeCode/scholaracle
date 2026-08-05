/**
 * Extension options — pair connector token + register portal from active tab.
 * Never stores portal passwords here (session cookies handle auth).
 */

import { getConfig, setConfig, upsertCredential, type IPortalCredential } from '../lib/storage';

const ADAPTER_BY_HOST: ReadonlyArray<{
  readonly match: RegExp;
  readonly provider: IPortalCredential['provider'];
  readonly adapterId: string;
}> = [
  { match: /instructure\.com/i, provider: 'canvas', adapterId: 'com.instructure.canvas' },
  { match: /skyward/i, provider: 'skyward', adapterId: 'com.skyward.iscorp' },
  { match: /aeries/i, provider: 'aeries', adapterId: 'com.aeries.portal' },
];

function show(msg: string, ok: boolean): void {
  const el = document.getElementById('msg');
  if (!el) return;
  el.textContent = msg;
  el.className = `msg ${ok ? 'ok' : 'err'}`;
}

async function init(): Promise<void> {
  const config = await getConfig();
  const apiEl = document.getElementById('apiBaseUrl') as HTMLInputElement | null;
  const tokenEl = document.getElementById('connectorToken') as HTMLInputElement | null;
  const hoursEl = document.getElementById('scheduleHours') as HTMLSelectElement | null;
  if (config && apiEl && tokenEl && hoursEl) {
    apiEl.value = config.apiBaseUrl;
    tokenEl.value = config.connectorToken;
    hoursEl.value = String(config.scheduleHours);
  }

  document.getElementById('save')?.addEventListener('click', async () => {
    const apiBaseUrl = apiEl?.value.trim() ?? '';
    const connectorToken = tokenEl?.value.trim() ?? '';
    const scheduleHours = Number(hoursEl?.value ?? 6);
    if (!apiBaseUrl || !connectorToken) {
      show('API URL and connector token are required.', false);
      return;
    }
    await setConfig({ apiBaseUrl, connectorToken, scheduleHours });
    show('Saved. Scheduled sync will use this pairing.', true);
  });

  document.getElementById('register-tab')?.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url;
    if (!url || !/^https?:/i.test(url)) {
      show('Open a school portal tab first.', false);
      return;
    }
    const host = new URL(url).hostname;
    const match = ADAPTER_BY_HOST.find((a) => a.match.test(host));
    if (!match) {
      show(
        `No builtin scraper for host ${host}. Sideload a local scraper in a future update.`,
        false
      );
      return;
    }
    const baseUrl = `${new URL(url).origin}`;
    const cred: IPortalCredential = {
      provider: match.provider,
      sourceId: `ext-${match.provider}-${host}`,
      studentExternalId: 'default',
      institutionExternalId: host,
      adapterId: match.adapterId,
      baseUrl,
      adapterVersion: '0.1.0',
    };
    await upsertCredential(cred);
    show(`Registered ${match.provider} for ${host}. Use Sync Now from the popup.`, true);
  });
}

void init();
