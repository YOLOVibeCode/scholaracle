/**
 * Opens the right screen when a push is tapped: foreground/background taps via the response
 * listener, and the tap that cold-started the app via getLastNotificationResponse (once, after
 * auth has loaded; ignored when signed out).
 */

import { useEffect, useRef } from 'react';
import type { NotificationResponse } from 'expo-notifications';
import type { UserRole } from '@scholaracle/contracts';
import { apiClient } from '../api/client';
import { addResponseListener, clearLaunchPushResponse, getLaunchPushResponse } from './pushSetup';
import { planPushNavigation, resolvePushNav, type IPushNavResult } from './pushRouting';

export interface IPushTapNavigationOptions {
  readonly isLoading: boolean;
  readonly isLoggedIn: boolean;
  readonly role?: UserRole | null;
  readonly accountEpoch: number;
  readonly onNavigate: (next: IPushNavResult) => void;
}

export function usePushTapNavigation(options: IPushTapNavigationOptions): void {
  const { isLoading, isLoggedIn, role, accountEpoch } = options;
  const latest = useRef(options);
  latest.current = options;
  const coldStartHandled = useRef(false);

  const open = (response: NotificationResponse): void => {
    const { isLoggedIn: signedIn, role: currentRole, accountEpoch: epoch } = latest.current;
    const data: unknown = response.notification.request.content.data;
    const target = planPushNavigation(data, { isLoggedIn: signedIn, role: currentRole });
    if (!target) return;
    void resolvePushNav(target, currentRole, apiClient).then((next) => {
      // Drop the result if the user signed out or switched account while we were looking up.
      const now = latest.current;
      if (!now.isLoggedIn || now.accountEpoch !== epoch) return;
      now.onNavigate(next);
    });
  };

  // Foreground / background taps.
  useEffect(() => {
    const subscription = addResponseListener(open);
    return () => subscription.remove();
  }, []);

  // Cold start: handle the launching tap exactly once, as soon as auth is known.
  useEffect(() => {
    if (isLoading || coldStartHandled.current) return;
    coldStartHandled.current = true;
    const response = getLaunchPushResponse();
    if (!response) return;
    clearLaunchPushResponse();
    open(response); // planPushNavigation ignores it when signed out
  }, [isLoading, isLoggedIn, role, accountEpoch]);
}
