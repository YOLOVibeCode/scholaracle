/** Runtime identity — OTA channel, API URL, app version, device. */

export interface DiagEnv {
  apiUrl: string;
  appVersion: string | null;
  nativeBuild: string | null;
  runtimeVersion: unknown;
  updateId: string | null;
  channel: string | null;
  updateCreatedAt: string | null;
  isEmbeddedLaunch: boolean | null;
  emergencyLaunchReason: string | null;
  model: string | null;
  os: string | null;
  locale: string | null;
  timezone: string | null;
}

function updatesSlice(): Pick<
  DiagEnv,
  'updateId' | 'channel' | 'updateCreatedAt' | 'isEmbeddedLaunch' | 'emergencyLaunchReason'
> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as {
      updateId: string | null;
      channel: string | null;
      createdAt: Date | string | null;
      isEmbeddedLaunch: boolean;
      emergencyLaunchReason: string | null;
    };
    const created = Updates.createdAt;
    return {
      updateId: Updates.updateId ?? null,
      channel: Updates.channel ?? null,
      updateCreatedAt: created ? String(created) : null,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch ?? null,
      emergencyLaunchReason: Updates.emergencyLaunchReason ?? null,
    };
  } catch {
    return {
      updateId: null,
      channel: null,
      updateCreatedAt: null,
      isEmbeddedLaunch: null,
      emergencyLaunchReason: null,
    };
  }
}

function deviceSlice(): Pick<DiagEnv, 'model' | 'os'> {
  try {
    // expo-device is not a declared dependency — optional require so the
    // native fingerprint does not change (OTA-safe).
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const Device = require('expo-device') as {
      modelName: string | null;
      osName: string | null;
      osVersion: string | null;
    };
    const os = [Device.osName, Device.osVersion].filter(Boolean).join(' ');
    return { model: Device.modelName ?? null, os: os || null };
  } catch {
    return { model: null, os: null };
  }
}

export function snapshotEnv(): DiagEnv {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const Constants = require('expo-constants') as {
    expoConfig?: {
      version?: string;
      runtimeVersion?: unknown;
      ios?: { buildNumber?: string };
    } | null;
    nativeBuildVersion?: string | null;
  };
  const cfg = Constants.expoConfig;
  return {
    apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:2801',
    appVersion: cfg?.version ?? null,
    nativeBuild: Constants.nativeBuildVersion ?? cfg?.ios?.buildNumber ?? null,
    runtimeVersion: cfg?.runtimeVersion ?? null,
    ...updatesSlice(),
    ...deviceSlice(),
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
