import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { snapshotEnv } from '../../diag';
import type { DiagEnv } from '../../diag';
import {
  DIAG_ACCENT,
  DIAG_BG,
  DIAG_BG_ELEVATED,
  DIAG_BORDER,
  DIAG_TEXT_PRIMARY,
  DIAG_TEXT_TERTIARY,
} from './diagTheme';

export function EnvPanel(): React.ReactElement {
  const [env, setEnv] = useState<DiagEnv>(() => snapshotEnv());
  const [health, setHealth] = useState<string>('tap to check');

  const refresh = useCallback(() => setEnv(snapshotEnv()), []);

  const checkHealth = useCallback(async () => {
    setHealth('…');
    try {
      const res = await fetch(`${env.apiUrl}/api/health`);
      const body = await res.text();
      setHealth(`${res.status} ${body.slice(0, 120)}`);
    } catch (err) {
      setHealth(err instanceof Error ? err.message : 'fail');
    }
  }, [env.apiUrl]);

  const rows: Array<[string, string]> = [
    ['api', env.apiUrl],
    ['version', `${env.appVersion ?? '?'} / ${env.nativeBuild ?? '?'}`],
    ['runtime', String(env.runtimeVersion)],
    ['channel', env.channel ?? '?'],
    ['update', env.updateId ?? 'embedded'],
    ['embedded', String(env.isEmbeddedLaunch)],
    ['emergency', env.emergencyLaunchReason ?? 'none'],
    ['device', `${env.model ?? '?'} ${env.os ?? ''}`.trim()],
    ['locale', `${env.locale ?? '?'} ${env.timezone ?? ''}`.trim()],
    ['health', health],
  ];

  return (
    <ScrollView style={styles.wrap} testID="panel-diag-env">
      {rows.map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={styles.k}>{k}</Text>
          <Text style={styles.v} selectable>
            {v}
          </Text>
        </View>
      ))}
      <View style={styles.actions}>
        <Pressable onPress={refresh} style={styles.btn} testID="btn-diag-env-refresh">
          <Text style={styles.btnText}>Refresh env</Text>
        </Pressable>
        <Pressable onPress={() => void checkHealth()} style={styles.btn} testID="btn-diag-health">
          <Text style={styles.btnText}>Ping /api/health</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: DIAG_BG },
  row: { marginBottom: 10 },
  k: {
    color: DIAG_TEXT_TERTIARY,
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  v: { color: DIAG_TEXT_PRIMARY, fontSize: 12, marginTop: 2 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    paddingBottom: 24,
  },
  btn: {
    backgroundColor: DIAG_BG_ELEVATED,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: DIAG_BORDER,
  },
  btnText: { color: DIAG_ACCENT, fontSize: 12, fontWeight: '500' },
});
