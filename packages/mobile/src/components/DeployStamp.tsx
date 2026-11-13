import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { registerDiagSecretTap } from '../diag/secretTap';
import { snapshotEnv } from '../diag/env';
import {
  fetchBackendStamp,
  formatApiLine,
  formatAppLine,
  formatLaneLine,
  isDeployStampHidden,
  localStampFromEnv,
  resolveApiBaseUrl,
  type IBackendStamp,
} from '../version/deployStamp';

/**
 * Always-visible identity strip: marketing version, native build, EAS
 * channel, and the Railway SHA of the API this binary is talking to.
 */
export function DeployStamp(): React.ReactElement {
  const [local] = useState(() => {
    const env = snapshotEnv();
    return localStampFromEnv({
      ...env,
      apiUrl: resolveApiBaseUrl(env.apiUrl),
    });
  });
  const [backend, setBackend] = useState<IBackendStamp | null>(null);
  const hidden = isDeployStampHidden(process.env['EXPO_PUBLIC_HIDE_DEPLOY_STAMP']);

  useEffect(() => {
    if (hidden) return;
    void fetchBackendStamp(local.apiUrl).then(setBackend);
  }, [hidden, local.apiUrl]);

  if (hidden) {
    return (
      <Pressable
        style={styles.hiddenTarget}
        testID="deploy-stamp"
        onPress={registerDiagSecretTap}
      />
    );
  }

  return (
    <Pressable style={styles.wrap} testID="deploy-stamp" onPress={registerDiagSecretTap}>
      <Text style={[styles.line, styles.lane]} testID="text-lane-stamp" selectable>
        {formatLaneLine(local.apiUrl)}
      </Text>
      <Text style={styles.line} testID="text-app-stamp" selectable>
        {formatAppLine(local)}
      </Text>
      <Text style={styles.line} testID="text-api-stamp" selectable>
        {formatApiLine(local, backend)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  hiddenTarget: {
    height: 24,
  },
  lane: {
    fontWeight: '600',
    marginBottom: 2,
  },
  line: {
    color: '#6c757d',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    lineHeight: 16,
  },
});
