/**
 * MyAlertsEditor — an adult's own alert settings for one student: one-tap Silence, channels
 * (email / push / text) and alert types, saved through the `save` callback the parent supplies
 * (contact row or owner prefs). Logic: src/sharing/myAlertsModel.ts.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { ALERT_CHANNELS } from '../sharing/common';
import {
  alertTypeRows,
  alertsSummary,
  isSilenced,
  myAlertsDirty,
  setTypeEnabled,
  silence,
  silenceButtonLabel,
  toggleChannel,
  typeEnabled,
  unsilence,
  type IMyAlertsDraft,
} from '../sharing/myAlertsModel';

interface IMyAlertsEditorProps {
  readonly studentName: string;
  readonly saved: IMyAlertsDraft;
  /** Prefix for test ids, e.g. `my-alerts-<studentId>`. */
  readonly testID: string;
  save(draft: IMyAlertsDraft): Promise<void>;
}

export function MyAlertsEditor({
  studentName,
  saved,
  testID,
  save,
}: IMyAlertsEditorProps): React.ReactElement {
  const [draft, setDraft] = useState<IMyAlertsDraft>(saved);
  // What the server last accepted. `saved` is only the starting point: comparing against the
  // prop would leave the editor "unsaved" forever after the first successful save.
  const [lastSaved, setLastSaved] = useState<IMyAlertsDraft>(saved);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const commit = async (next: IMyAlertsDraft): Promise<void> => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    setSavedFlash(false);
    try {
      await save(next);
      setDraft(next);
      setLastSaved(next);
      setSavedFlash(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save your alert settings');
    } finally {
      setIsSaving(false);
    }
  };

  const edit = (next: IMyAlertsDraft): void => {
    setDraft(next);
    setSavedFlash(false);
  };

  const silenced = isSilenced(draft);
  const dirty = myAlertsDirty(draft, lastSaved);

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.summary} testID={`${testID}-summary`}>
        {alertsSummary(draft)}
      </Text>
      <TouchableOpacity
        style={[
          styles.silenceButton,
          silenced && styles.unsilenceButton,
          isSaving && styles.disabled,
        ]}
        onPress={() => void commit(silenced ? unsilence(draft) : silence(draft))}
        disabled={isSaving}
        accessibilityRole="button"
        accessibilityLabel={silenceButtonLabel(draft, studentName)}
        testID={`${testID}-silence`}
      >
        <Text style={[styles.silenceText, silenced && styles.unsilenceText]}>
          {silenceButtonLabel(draft, studentName)}
        </Text>
      </TouchableOpacity>

      <Text style={styles.sectionHeader}>Channels</Text>
      {ALERT_CHANNELS.map((channel) => (
        <View key={channel.value} style={styles.row}>
          <Text style={styles.rowText}>{channel.text}</Text>
          <Switch
            value={draft.receiveAlerts && draft.channels.includes(channel.value)}
            onValueChange={() => edit(toggleChannel(draft, channel.value))}
            disabled={isSaving}
            accessibilityLabel={`${channel.text} alerts for ${studentName}`}
            testID={`${testID}-channel-${channel.value}`}
          />
        </View>
      ))}

      <Text style={styles.sectionHeader}>Alert types</Text>
      {alertTypeRows().map((row) => (
        <View key={row.key} style={styles.row}>
          <Text style={styles.rowText}>{row.label}</Text>
          <Switch
            value={typeEnabled(draft, row.key)}
            onValueChange={(enabled) => edit(setTypeEnabled(draft, row.key, enabled))}
            disabled={isSaving}
            accessibilityLabel={`${row.label} for ${studentName}`}
            testID={`${testID}-type-${row.key}`}
          />
        </View>
      ))}

      {error ? (
        <Text style={styles.error} accessibilityRole="alert" testID={`${testID}-error`}>
          {error}
        </Text>
      ) : null}
      {savedFlash && !dirty ? (
        <Text style={styles.savedText} accessibilityLiveRegion="polite" testID={`${testID}-saved`}>
          Saved
        </Text>
      ) : null}
      <TouchableOpacity
        style={[styles.primaryButton, (!dirty || isSaving) && styles.disabled]}
        onPress={() => void commit(draft)}
        disabled={!dirty || isSaving}
        accessibilityRole="button"
        accessibilityLabel={`Save alert settings for ${studentName}`}
        accessibilityState={{ disabled: !dirty || isSaving, busy: isSaving }}
        testID={`${testID}-save`}
      >
        <Text style={styles.primaryText}>{isSaving ? 'Saving…' : 'Save'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 8 },
  summary: { fontSize: 14, color: '#6c757d', marginBottom: 8 },
  silenceButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#dc3545',
    backgroundColor: '#fff',
  },
  silenceText: { color: '#dc3545', fontWeight: '700', fontSize: 15 },
  unsilenceButton: { borderColor: '#2b8a3e' },
  unsilenceText: { color: '#2b8a3e' },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rowText: { fontSize: 15, color: '#1a1a2e', flex: 1, paddingRight: 12 },
  error: { color: '#dc3545', marginTop: 10, fontSize: 14 },
  savedText: { color: '#2b8a3e', marginTop: 10, fontSize: 14, fontWeight: '600' },
  primaryButton: {
    marginTop: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#4361ee',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.45 },
});
