import type { IRemoteSelectorPatchesFlags } from '@scholaracle/contracts';

function envTruthy(name: string): boolean {
  const raw = process.env[name];
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function resolveRemoteSelectorPatchesFlags(): IRemoteSelectorPatchesFlags {
  const killSwitch = envTruthy('REMOTE_SELECTOR_PATCHES_KILL_SWITCH');
  const enabled = envTruthy('REMOTE_SELECTOR_PATCHES_ENABLED');
  return {
    remoteSelectorPatches: enabled && !killSwitch,
    killSwitch,
  };
}
