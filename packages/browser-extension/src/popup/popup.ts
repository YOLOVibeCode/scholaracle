/**
 * Extension popup — shows sync status, recent run history, and Sync Now button.
 */

import { getRunLedger, getConfig, type IRunRecord } from '../lib/storage';

async function init(): Promise<void> {
  const [runs, config] = await Promise.all([getRunLedger(), getConfig()]);

  // Run list
  const runList = document.getElementById('run-list');
  if (runList) {
    if (runs.length === 0) {
      runList.innerHTML = '<p class="empty">No syncs yet</p>';
    } else {
      runList.innerHTML = runs
        .slice(0, 5)
        .map((r) => renderRun(r))
        .join('');
    }
  }

  // Status
  const statusEl = document.getElementById('sync-status');
  const lastRun = runs[0];
  if (statusEl && lastRun) {
    statusEl.textContent =
      lastRun.status === 'success'
        ? `Last sync: ${formatTime(lastRun.completedAt ?? lastRun.startedAt)}`
        : lastRun.status === 'in_progress'
          ? 'Syncing...'
          : `Failed: ${lastRun.errorMessage ?? 'Unknown error'}`;
    statusEl.className = `status ${lastRun.status === 'success' ? '' : lastRun.status}`;
  }

  // Next sync (from alarm)
  const nextEl = document.getElementById('next-sync');
  if (nextEl && config) {
    const alarms = await chrome.alarms.getAll();
    const alarm = alarms.find((a) => a.name === 'slc_sync');
    if (alarm) {
      nextEl.textContent = `Next: ${formatTime(new Date(alarm.scheduledTime).toISOString())}`;
    }
  }

  // Sync Now button
  const syncBtn = document.getElementById('sync-now-btn') as HTMLButtonElement | null;
  if (syncBtn) {
    syncBtn.addEventListener('click', async () => {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing...';
      try {
        await chrome.runtime.sendMessage({ type: 'SYNC_NOW' });
        // Reload after a short delay so new run appears
        setTimeout(() => window.location.reload(), 2000);
      } catch {
        syncBtn.disabled = false;
        syncBtn.textContent = 'Sync Now';
        showError('Failed to start sync. Make sure you are on a portal page.');
      }
    });
  }

  // Settings button — opens options page if defined, or a config tab
  const settingsBtn = document.getElementById('settings-btn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      void chrome.tabs
        .create({ url: chrome.runtime.getURL('options.html') })
        .catch(() => undefined);
    });
  }
}

function renderRun(run: IRunRecord): string {
  return `
    <div class="run-item">
      <div class="run-header">
        <span class="run-provider">${run.provider}</span>
        <span class="run-status ${run.status}">${run.status}</span>
      </div>
      <div class="run-time">${formatTime(run.startedAt)}</div>
      ${run.opCount !== undefined ? `<div class="run-ops">${run.opCount} operations</div>` : ''}
      ${run.errorMessage ? `<div class="run-ops" style="color:#dc3545">${run.errorMessage}</div>` : ''}
    </div>
  `;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function showError(msg: string): void {
  const el = document.getElementById('error-msg');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
  }
}

void init();
