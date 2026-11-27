'use client';

import { useSyncExternalStore } from 'react';
import { isFeedbackInMenu, subscribeFeedback } from './feedback';

const never = (): boolean => false;

/**
 * True when this page's menu should offer "Send feedback" (see `isFeedbackInMenu`).
 * False on the server and until the widget script has run, so server and client markup match.
 */
export function useFeedbackInMenu(): boolean {
  return useSyncExternalStore(subscribeFeedback, isFeedbackInMenu, never);
}
