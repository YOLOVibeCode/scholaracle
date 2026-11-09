import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: null, easConfig: null },
}));

jest.mock('../api/client', () => ({
  apiClient: {
    getPushToken: jest.fn().mockResolvedValue(null),
    registerPushToken: jest.fn().mockResolvedValue(undefined),
  },
}));

import {
  ANDROID_DEFAULT_CHANNEL_ID,
  clearLaunchPushResponse,
  ensureAndroidNotificationChannel,
  getLaunchPushResponse,
  registerForPushNotifications,
} from './pushSetup';

const n = Notifications as unknown as {
  setNotificationChannelAsync: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  getLastNotificationResponse: jest.Mock;
  clearLastNotificationResponse: jest.Mock;
};
const platform = Platform as { OS: string };

describe('pushSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    platform.OS = 'ios';
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    platform.OS = 'ios';
  });

  it('creates a high-importance "Alerts" channel on Android only', async () => {
    await ensureAndroidNotificationChannel();
    expect(n.setNotificationChannelAsync).not.toHaveBeenCalled();
    platform.OS = 'android';
    await ensureAndroidNotificationChannel();
    expect(n.setNotificationChannelAsync).toHaveBeenCalledWith(
      ANDROID_DEFAULT_CHANNEL_ID,
      expect.objectContaining({ name: 'Alerts', importance: 4 })
    );
  });

  it('swallows channel errors', async () => {
    platform.OS = 'android';
    n.setNotificationChannelAsync.mockRejectedValueOnce(new Error('boom'));
    await expect(ensureAndroidNotificationChannel()).resolves.toBeUndefined();
  });

  it('creates the channel before asking for permission', async () => {
    platform.OS = 'android';
    const order: string[] = [];
    n.getPermissionsAsync.mockResolvedValueOnce({ status: 'undetermined' });
    n.setNotificationChannelAsync.mockImplementationOnce(async () => {
      order.push('channel');
      return null;
    });
    n.requestPermissionsAsync.mockImplementationOnce(async () => {
      order.push('permission');
      return { status: 'denied' };
    });
    expect(await registerForPushNotifications()).toBeNull();
    expect(order).toEqual(['channel', 'permission']);
  });

  it('returns the launch tap and clears it', () => {
    const response = { notification: {} };
    n.getLastNotificationResponse.mockReturnValueOnce(response);
    expect(getLaunchPushResponse()).toBe(response);
    expect(getLaunchPushResponse()).toBeNull();
    clearLaunchPushResponse();
    expect(n.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  it('tolerates the native module throwing', () => {
    n.getLastNotificationResponse.mockImplementationOnce(() => {
      throw new Error('no native');
    });
    expect(getLaunchPushResponse()).toBeNull();
    n.clearLastNotificationResponse.mockImplementationOnce(() => {
      throw new Error('no native');
    });
    expect(() => clearLaunchPushResponse()).not.toThrow();
  });
});
