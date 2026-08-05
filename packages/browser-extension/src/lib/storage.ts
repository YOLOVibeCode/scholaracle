/**
 * Typed wrappers around chrome.storage.local for extension credential
 * and config storage. Credentials go in chrome.storage.local which is
 * sandboxed to the extension — never synced to the cloud.
 */

export interface IExtensionConfig {
  readonly connectorToken: string;
  readonly apiBaseUrl: string;
  readonly scheduleHours: number;
}

export interface IPortalCredential {
  readonly provider: 'canvas' | 'skyward' | 'aeries';
  readonly sourceId: string;
  readonly studentExternalId: string;
  readonly institutionExternalId: string;
  readonly adapterId: string;
  readonly baseUrl: string;
  readonly adapterVersion: string;
}

export interface IRunRecord {
  readonly runId: string;
  readonly provider: string;
  readonly status: 'success' | 'failed' | 'in_progress';
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly opCount?: number;
  readonly errorMessage?: string;
}

const CONFIG_KEY = 'slc_config';
const CREDENTIALS_KEY = 'slc_credentials';
const RUN_LEDGER_KEY = 'slc_run_ledger';
const MAX_RUNS = 30;

export async function getConfig(): Promise<IExtensionConfig | null> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  return (result[CONFIG_KEY] as IExtensionConfig | undefined) ?? null;
}

export async function setConfig(config: IExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

export async function getCredentials(): Promise<IPortalCredential[]> {
  const result = await chrome.storage.local.get(CREDENTIALS_KEY);
  return (result[CREDENTIALS_KEY] as IPortalCredential[] | undefined) ?? [];
}

export async function setCredentials(credentials: IPortalCredential[]): Promise<void> {
  await chrome.storage.local.set({ [CREDENTIALS_KEY]: credentials });
}

export async function upsertCredential(cred: IPortalCredential): Promise<void> {
  const existing = await getCredentials();
  const idx = existing.findIndex((c) => c.sourceId === cred.sourceId);
  const updated =
    idx !== -1
      ? [...existing.slice(0, idx), cred, ...existing.slice(idx + 1)]
      : [...existing, cred];
  await setCredentials(updated);
}

export async function getRunLedger(): Promise<IRunRecord[]> {
  const result = await chrome.storage.local.get(RUN_LEDGER_KEY);
  return (result[RUN_LEDGER_KEY] as IRunRecord[] | undefined) ?? [];
}

export async function appendRun(run: IRunRecord): Promise<void> {
  const existing = await getRunLedger();
  const updated = [run, ...existing].slice(0, MAX_RUNS);
  await chrome.storage.local.set({ [RUN_LEDGER_KEY]: updated });
}

export async function updateRunStatus(runId: string, update: Partial<IRunRecord>): Promise<void> {
  const existing = await getRunLedger();
  const idx = existing.findIndex((r) => r.runId === runId);
  if (idx === -1) return;
  const updated = [
    ...existing.slice(0, idx),
    { ...existing[idx]!, ...update },
    ...existing.slice(idx + 1),
  ];
  await chrome.storage.local.set({ [RUN_LEDGER_KEY]: updated });
}
