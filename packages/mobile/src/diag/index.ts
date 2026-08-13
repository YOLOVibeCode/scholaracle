export { log, getEntries, subscribe, drain, bootMs, resetDiagStoreForTests } from './store';
export type { DiagEntry, DiagLevel, DiagTag } from './store';
export { installDiagCapture, uninstallDiagCaptureForTests } from './capture';
export {
  hydrateGate,
  unlockDiag,
  lockDiag,
  isUnlocked,
  subscribeGate,
  isGateHydrated,
} from './gate';
export { snapshotEnv } from './env';
export type { DiagEnv } from './env';
export { formatSession } from './format';
export { openDiagPanel, closeDiagPanel, isDiagPanelOpen, subscribePanel } from './panel';
export { fingerprint, redact } from './redact';
