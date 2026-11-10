import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { UpdateRequiredScreen } from '../components/UpdateRequiredScreen';
import { log } from '../diag';
import { snapshotEnv } from '../diag/env';
import {
  checkAndFetchOta,
  resolveUpdateGate,
  type IUpdatesApi,
  type IUpdateGate,
} from './launchChecks';

function loadUpdates(): IUpdatesApi | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    return require('expo-updates') as IUpdatesApi;
  } catch {
    return null;
  }
}

/** Runs once at launch. Never blocks rendering: the gate appears only if one resolves. */
function LaunchGate({ children }: { readonly children: React.ReactNode }): React.ReactElement {
  const [gate, setGate] = useState<IUpdateGate | null>(null);

  useEffect(() => {
    let cancelled = false;
    const env = snapshotEnv();
    void resolveUpdateGate({
      currentVersion: env.appVersion,
      currentBuild: env.nativeBuild,
      platform: Platform.OS,
    }).then((result) => {
      if (cancelled || !result) return;
      log('warn', 'update', 'update required by server minimum version');
      setGate(result);
    });
    void checkAndFetchOta(loadUpdates(), __DEV__).then((outcome) => {
      log('info', 'update', `ota check: ${outcome}`);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (gate) return <UpdateRequiredScreen message={gate.message} storeUrl={gate.storeUrl} />;
  return <>{children}</>;
}

/** Single root wrap: error boundary + force-update gate + launch OTA check. */
export function AppRootGuard({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <AppErrorBoundary>
      <LaunchGate>{children}</LaunchGate>
    </AppErrorBoundary>
  );
}
