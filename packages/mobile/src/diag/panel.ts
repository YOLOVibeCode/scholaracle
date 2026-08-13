/** Module-level panel open flag — shared by the 7-tap bubble and the deep-link route. */

const listeners = new Set<() => void>();
let open = false;

function emit(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function isDiagPanelOpen(): boolean {
  return open;
}

export function openDiagPanel(): void {
  open = true;
  emit();
}

export function closeDiagPanel(): void {
  open = false;
  emit();
}

export function subscribePanel(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
