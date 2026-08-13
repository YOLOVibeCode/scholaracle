import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import {
  closeDiagPanel,
  hydrateGate,
  isDiagPanelOpen,
  isUnlocked,
  log,
  openDiagPanel,
  subscribeGate,
  subscribePanel,
  unlockDiag,
} from '../../diag';
import { LogPanel } from './LogPanel';
import { EnvPanel } from './EnvPanel';
import { ActionsPanel } from './ActionsPanel';
import {
  DIAG_ACCENT,
  DIAG_BG,
  DIAG_BG_ELEVATED,
  DIAG_BORDER,
  DIAG_TEXT_PRIMARY,
  DIAG_TEXT_SECONDARY,
} from './diagTheme';

type Tab = 'log' | 'env' | 'act';

/** Logs auth state changes. Mounted inside AuthProvider so useAuth() works. */
function AuthTrace(): null {
  const { isLoggedIn, isLoading } = useAuth();
  useEffect(() => {
    log('info', 'auth', isLoading ? 'loading' : isLoggedIn ? 'in' : 'out');
  }, [isLoading, isLoggedIn]);
  return null;
}

export function DebugOverlay(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const taps = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, bump] = useState(0);
  const [tab, setTab] = useState<Tab>('log');

  useEffect(() => {
    const unsubGate = subscribeGate(() => bump((n) => n + 1));
    const unsubPanel = subscribePanel(() => bump((n) => n + 1));
    void hydrateGate();
    return () => {
      unsubGate();
      unsubPanel();
    };
  }, []);

  const onSecretTap = (): void => {
    taps.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      taps.current = 0;
    }, 2000);
    if (taps.current >= 7) {
      taps.current = 0;
      void unlockDiag().then(() => openDiagPanel());
    }
  };

  const unlocked = isUnlocked();
  const panelOpen = isDiagPanelOpen();

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <AuthTrace />
      {/* Invisible 7-tap unlock target — top-right corner */}
      <Pressable
        testID="btn-diag-unlock"
        onPress={onSecretTap}
        style={[styles.hit, { top: insets.top + 4, right: 4 }]}
        accessibilityLabel="Diagnostics unlock"
        accessibilityElementsHidden
      />
      {unlocked ? (
        <Pressable
          testID="btn-diag-open"
          onPress={openDiagPanel}
          style={[styles.bubble, { bottom: insets.bottom + 88, right: 12 }]}
        >
          <Text style={styles.bubbleText}>diag</Text>
        </Pressable>
      ) : null}
      <Modal
        visible={panelOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeDiagPanel}
      >
        <View
          style={[styles.modal, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}
          testID="modal-diag"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Scholarmancy diag</Text>
            <Pressable onPress={closeDiagPanel} testID="btn-diag-close">
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.tabs}>
            {(['log', 'env', 'act'] as Tab[]).map((t) => (
              <Pressable
                key={t}
                onPress={() => setTab(t)}
                style={[styles.tab, tab === t && styles.tabOn]}
                testID={`btn-diag-tab-${t}`}
              >
                <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          {tab === 'log' ? <LogPanel /> : null}
          {tab === 'env' ? <EnvPanel /> : null}
          {tab === 'act' ? <ActionsPanel /> : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    position: 'absolute',
    width: 44,
    height: 44,
    zIndex: 9999,
  },
  bubble: {
    position: 'absolute',
    zIndex: 9999,
    backgroundColor: DIAG_ACCENT,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    opacity: 0.85,
  },
  bubbleText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  modal: {
    flex: 1,
    backgroundColor: DIAG_BG,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: DIAG_TEXT_PRIMARY, fontSize: 17, fontWeight: '600' },
  close: { color: DIAG_ACCENT, fontSize: 15, fontWeight: '500' },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: DIAG_BG_ELEVATED,
    borderWidth: 1,
    borderColor: DIAG_BORDER,
  },
  tabOn: { backgroundColor: DIAG_ACCENT, borderColor: DIAG_ACCENT },
  tabText: { color: DIAG_TEXT_SECONDARY, fontSize: 13, fontWeight: '500' },
  tabTextOn: { color: '#fff' },
});
