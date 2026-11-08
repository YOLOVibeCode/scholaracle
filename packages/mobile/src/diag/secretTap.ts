import { unlockDiag } from './gate';
import { openDiagPanel } from './panel';

const TAPS_TO_UNLOCK = 7;
const RESET_MS = 2000;

let taps = 0;
let resetTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Seven taps within 2 s on the deploy stamp unlock diagnostics and open the panel.
 * The counter lives here so the trigger can sit on the footer: an invisible hit
 * target in the top-right corner covered every screen's Sync and header buttons.
 */
export function registerDiagSecretTap(): void {
  taps += 1;
  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    taps = 0;
  }, RESET_MS);
  if (taps >= TAPS_TO_UNLOCK) {
    taps = 0;
    void unlockDiag().then(() => openDiagPanel());
  }
}
