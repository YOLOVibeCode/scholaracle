import React, { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text } from 'react-native';
import { closeDiagPanel, formatSession, getEntries, lockDiag, log, snapshotEnv } from '../../diag';
import { fullSignOut } from '../../auth/signOut';
import {
  DIAG_ACCENT,
  DIAG_BG,
  DIAG_BG_ELEVATED,
  DIAG_BORDER,
  DIAG_TEXT_SECONDARY,
} from './diagTheme';

async function shareLog(): Promise<void> {
  const text = formatSession(getEntries(), snapshotEnv());
  await Share.share({ message: text, title: 'Scholarmancy diag' });
}

async function copyLog(): Promise<string> {
  const text = formatSession(getEntries(), snapshotEnv());
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { Clipboard } = require('react-native') as {
      Clipboard?: { setString: (s: string) => void };
    };
    Clipboard?.setString(text);
    return 'copied';
  } catch {
    await Share.share({ message: text });
    return 'shared';
  }
}

async function checkUpdate(): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const Updates = require('expo-updates') as {
      checkForUpdateAsync: () => Promise<{ isAvailable: boolean }>;
      fetchUpdateAsync: () => Promise<unknown>;
      reloadAsync: () => Promise<void>;
    };
    const result = await Updates.checkForUpdateAsync();
    log('info', 'update', `available=${result.isAvailable}`);
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
      return 'reloading';
    }
    return 'up to date';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', 'update', msg);
    return msg;
  }
}

export function ActionsPanel(): React.ReactElement {
  const [status, setStatus] = useState('');

  return (
    <ScrollView style={styles.wrap} testID="panel-diag-actions">
      <Pressable
        testID="btn-diag-share"
        style={styles.btn}
        onPress={() => void shareLog().then(() => setStatus('shared'))}
      >
        <Text style={styles.btnText}>Share log</Text>
      </Pressable>

      <Pressable
        testID="btn-diag-copy"
        style={styles.btn}
        onPress={() => void copyLog().then(setStatus)}
      >
        <Text style={styles.btnText}>Copy log</Text>
      </Pressable>

      <Pressable
        testID="btn-diag-update"
        style={styles.btn}
        onPress={() => void checkUpdate().then(setStatus)}
      >
        <Text style={styles.btnText}>Check / fetch OTA</Text>
      </Pressable>

      <Pressable
        testID="btn-diag-sign-out"
        style={styles.btn}
        onPress={() =>
          void fullSignOut()
            .then(() => {
              closeDiagPanel();
              setStatus('signed out');
            })
            .catch(() => setStatus('sign-out failed'))
        }
      >
        <Text style={styles.btnText}>Sign out</Text>
      </Pressable>

      <Pressable
        testID="btn-diag-lock"
        style={styles.btn}
        onPress={() => void lockDiag().then(() => setStatus('locked'))}
      >
        <Text style={styles.btnText}>Lock overlay</Text>
      </Pressable>

      {status ? <Text style={styles.status}>{status}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: DIAG_BG },
  btn: {
    backgroundColor: DIAG_BG_ELEVATED,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: DIAG_BORDER,
  },
  btnText: { color: DIAG_ACCENT, fontSize: 13, fontWeight: '500' },
  status: { color: DIAG_TEXT_SECONDARY, fontSize: 12, marginTop: 8 },
});
