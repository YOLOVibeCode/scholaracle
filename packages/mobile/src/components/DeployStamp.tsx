import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { snapshotEnv } from '../diag/env';
import {
  fetchBackendStamp,
  formatApiLine,
  formatAppLine,
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

  useEffect(() => {
    void fetchBackendStamp(local.apiUrl).then(setBackend);
  }, [local.apiUrl]);

  return (
    <View style={styles.wrap} testID="deploy-stamp">
      <Text style={styles.line} testID="text-app-stamp" selectable>
        {formatAppLine(local)}
      </Text>
      <Text style={styles.line} testID="text-api-stamp" selectable>
        {formatApiLine(local, backend)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  line: {
    color: '#6c757d',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
    lineHeight: 16,
  },
});
