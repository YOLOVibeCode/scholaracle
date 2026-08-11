/**
 * Push notification registration for APNs (iOS) / FCM (Android).
 *
 * Registers the device with Expo's push service, then sends the
 * Expo push token to the Scholaracle backend so it can be delivered
 * via the NotificationWorker.
 */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { apiClient } from '../api/client';

/** Configure foreground notification handling (show banner + sound). */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Register for push notifications and upload the token to the server.
 * Fully best-effort: callers fire-and-forget this, so nothing here may
 * escape as an unhandled rejection (native modules throw on simulators
 * and on builds without APNs entitlements).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    const alreadyRegistered = await apiClient.getPushToken();
    if (alreadyRegistered !== token) {
      await apiClient.registerPushToken(token);
    }
    return token;
  } catch (err) {
    // Best-effort: permission/native/upload failures must never crash the
    // app. Registration retries on the next login.
    console.warn('[push] registration skipped:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Subscribe to incoming push notifications (foreground). */
export function addNotificationListener(
  handler: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(handler);
}

/** Subscribe to notification taps (background / killed). */
export function addResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
