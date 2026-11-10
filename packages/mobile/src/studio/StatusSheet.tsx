import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  STUDENT_HELP_NOTE_MAX_CHARS,
  type IStudentStatusUpdateResponse,
  type StudentStatus,
} from '@scholaracle/contracts';
import {
  NEED_HELP_NOTE_PLACEHOLDER,
  NEED_HELP_TITLE,
  NEED_HELP_UNSTUCK_HINT,
  STATUS_SAVE_ERROR,
  clampNote,
  needHelpOutcomeMessage,
  needHelpPrompt,
  normalizeNote,
  noteCounter,
} from '@scholaracle/studio-core';
import {
  STATUS_OPTIONS,
  canDismiss,
  isSelected,
  stepAfterPick,
  type StatusSheetStep,
} from './statusSheetModel';

/** What the sheet is about. `currentStatus` is unknown on Today rows. */
export interface IStatusSheetTarget {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly currentStatus?: StudentStatus;
}

export interface IStatusSheetProps {
  readonly target: IStatusSheetTarget | null;
  onClose(): void;
  /**
   * Resolves with the server's answer once it accepted the change (an older
   * server answers without `notified`); rejects to keep the sheet open.
   */
  onSubmit(
    assignmentExternalId: string,
    status: StudentStatus,
    note?: string
  ): Promise<IStudentStatusUpdateResponse | undefined>;
}

/**
 * Bottom sheet shared by Today and This week: Not started / Working on it /
 * Need help / Done. Need help asks for an optional 140-char note, then tells
 * the student what actually happened: told, already told today, or just saved.
 * Dismiss is ignored while a save is in flight. No grades anywhere.
 */
export function StatusSheet({ target, onClose, onSubmit }: IStatusSheetProps): React.ReactElement {
  const [step, setStep] = useState<StatusSheetStep>('pick');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  // Fresh sheet for every target.
  useEffect(() => {
    setStep('pick');
    setNote('');
    setBusy(false);
    setError(null);
    setOutcome(null);
  }, [target?.assignmentExternalId]);

  const requestClose = (): void => {
    if (!canDismiss(busy)) return;
    onClose();
  };

  const submit = (status: StudentStatus, noteText?: string): void => {
    if (target === null || busy) return;
    setBusy(true);
    setError(null);
    void onSubmit(target.assignmentExternalId, status, noteText)
      .then((response) => {
        if (status === 'need_help') {
          setOutcome(needHelpOutcomeMessage(response));
          setStep('sent');
        } else {
          onClose();
        }
      })
      .catch(() => setError(STATUS_SAVE_ERROR))
      .finally(() => setBusy(false));
  };

  const pick = (status: StudentStatus): void => {
    if (stepAfterPick(status) === 'note') {
      setStep('note');
      return;
    }
    submit(status);
  };

  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="slide"
      onRequestClose={requestClose}
      testID="status-sheet"
    >
      <Pressable
        style={styles.backdrop}
        onPress={requestClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
        accessibilityState={{ disabled: busy }}
      />
      <View style={styles.sheet} accessibilityViewIsModal>
        {target === null ? null : step === 'pick' ? (
          <View testID="status-sheet-pick">
            <Text style={styles.title} numberOfLines={2}>
              {target.title}
            </Text>
            {STATUS_OPTIONS.map((option) => {
              const selected = isSelected(option, target.currentStatus);
              return (
                <TouchableOpacity
                  key={option.status}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => pick(option.status)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                  accessibilityState={{ selected, disabled: busy }}
                  testID={option.testId}
                >
                  <Text style={styles.optionMark}>{option.mark}</Text>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {busy ? <ActivityIndicator style={styles.spinner} color="#4361ee" /> : null}
            {error !== null ? (
              <Text style={styles.error} testID="status-sheet-error">
                {error}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={requestClose}
              disabled={busy}
              style={styles.cancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              accessibilityState={{ disabled: busy }}
              testID="status-sheet-cancel"
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : step === 'note' ? (
          <View testID="status-sheet-note">
            <Text style={styles.title}>{NEED_HELP_TITLE}</Text>
            <Text style={styles.prompt}>{needHelpPrompt(target.title)}</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={(text) => setNote(clampNote(text))}
              placeholder={NEED_HELP_NOTE_PLACEHOLDER}
              placeholderTextColor="#8a8f98"
              maxLength={STUDENT_HELP_NOTE_MAX_CHARS}
              multiline
              editable={!busy}
              accessibilityLabel="Note, optional"
              testID="need-help-note"
            />
            <Text style={styles.counter} testID="need-help-counter">
              {noteCounter(note)}
            </Text>
            {error !== null ? (
              <Text style={styles.error} testID="status-sheet-error">
                {error}
              </Text>
            ) : null}
            <View style={styles.row}>
              <TouchableOpacity
                onPress={() => submit('need_help', normalizeNote(note))}
                disabled={busy}
                style={styles.send}
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: busy }}
                testID="need-help-send"
              >
                <Text style={styles.sendText}>{busy ? 'Sending…' : 'Send'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={requestClose}
                disabled={busy}
                style={styles.cancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                accessibilityState={{ disabled: busy }}
                testID="need-help-cancel"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View testID="status-sheet-sent">
            <Text style={styles.title} testID="need-help-outcome">
              {outcome}
            </Text>
            <Text style={styles.prompt}>{NEED_HELP_UNSTUCK_HINT}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.send}
              accessibilityRole="button"
              accessibilityLabel="OK"
              testID="need-help-ok"
            >
              <Text style={styles.sendText}>OK</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
    gap: 8,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  prompt: { fontSize: 15, color: '#495057', marginBottom: 12, lineHeight: 21 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  optionSelected: { backgroundColor: '#eef1fd' },
  optionMark: { fontSize: 18, width: 24, textAlign: 'center', color: '#4361ee' },
  optionLabel: { fontSize: 17, color: '#1a1a2e' },
  optionLabelSelected: { fontWeight: '700', color: '#4361ee' },
  spinner: { marginVertical: 8 },
  error: { color: '#dc3545', fontSize: 14, marginTop: 8 },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1a1a2e',
    textAlignVertical: 'top',
  },
  counter: { alignSelf: 'flex-end', fontSize: 12, color: '#6c757d', marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  send: {
    backgroundColor: '#4361ee',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancel: { paddingVertical: 12, alignSelf: 'flex-start' },
  cancelText: { color: '#4361ee', fontSize: 16, fontWeight: '600' },
});
