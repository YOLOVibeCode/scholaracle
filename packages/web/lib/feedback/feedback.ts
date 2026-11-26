import { MOBILE_BREAKPOINT } from '@/hooks/use-mobile';

declare global {
  interface Window {
    /** Set by the relay's feedback widget script once it has run. */
    NoctusoftFeedback?: { open(): void; close(): void };
  }
}

/** Where the "Feedback" entry lives: the widget's own floating button, or the page's menu. */
export type FeedbackPlacement = 'floating' | 'menu';

/**
 * The widget's button floats over the bottom-right corner of the screen. On a phone that
 * corner holds the page's own buttons: at 375 x 667 it covered most of "Done connecting"
 * in the Add student wizard and took the tap. So below the width where the dashboard
 * navigation turns into a drawer, the button is not drawn and feedback lives in the menu.
 */
export function feedbackPlacementForWidth(width: number): FeedbackPlacement {
  return width < MOBILE_BREAKPOINT ? 'menu' : 'floating';
}

let placement: FeedbackPlacement | null = null;
let ready = false;
const listeners = new Set<() => void>();

/**
 * Decided once per page load. The widget script reads its options only when it runs, so
 * its button cannot follow a later resize. The menu entry must not follow one either, or a
 * phone turned sideways would end up with two ways to send feedback, or with none.
 */
export function feedbackPlacement(): FeedbackPlacement {
  if (placement === null) placement = feedbackPlacementForWidth(window.innerWidth);
  return placement;
}

/** Called by the widget component once the script has run and `window.NoctusoftFeedback` exists. */
export function markFeedbackReady(): void {
  ready = true;
  for (const listener of listeners) listener();
}

export function subscribeFeedback(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

/**
 * True when the page's own menu should offer "Send feedback": the widget has loaded (so
 * there is a form to open) and its floating button is not drawn. On a host where the widget
 * is not loaded at all this stays false.
 */
export function isFeedbackInMenu(): boolean {
  return ready && feedbackPlacement() === 'menu';
}

/** Open the widget's form. Does nothing when the widget is not on the page. */
export function openFeedback(): void {
  window.NoctusoftFeedback?.open();
}

export function resetFeedbackForTests(): void {
  placement = null;
  ready = false;
  listeners.clear();
}
