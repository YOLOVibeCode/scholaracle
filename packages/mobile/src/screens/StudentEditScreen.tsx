/**
 * StudentEditScreen — edit a student's name / grade / student id (same fields
 * as the web) and remove the student (confirmed; also purges the student's
 * local credentials and ledger entries).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { apiClient, type IStudentListItem } from '../api/client';
import {
  buildStudentUpdate,
  hasStudentEditChanges,
  initialStudentEditFields,
  type IStudentEditFields,
} from '../students/studentEditForm';
import { removeStudent, removeStudentConfirmText } from '../students/removeStudent';

interface IStudentEditScreenProps {
  readonly student: IStudentListItem;
  onBack(): void;
  /** Called after a successful save with the server's updated record. */
  onSaved(student: IStudentListItem): void;
  /** Called after the student was removed from the account and this phone. */
  onRemoved(): void;
}

export function StudentEditScreen({
  student,
  onBack,
  onSaved,
  onRemoved,
}: IStudentEditScreenProps): React.ReactElement {
  const [fields, setFields] = useState<IStudentEditFields>(() => initialStudentEditFields(student));
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<IStudentEditFields>): void => setFields((f) => ({ ...f, ...patch }));

  const handleSave = (): void => {
    if (busy) return;
    const built = buildStudentUpdate(fields);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    setBusy('save');
    void apiClient
      .updateStudent(student.id, built.request)
      .then((updated) => onSaved({ ...student, ...updated }))
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Could not save changes.')
      )
      .finally(() => setBusy(null));
  };

  const handleRemove = (): void => {
    if (busy) return;
    Alert.alert(`Remove ${student.name}?`, removeStudentConfirmText(student.name), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove student',
        style: 'destructive',
        onPress: (): void => {
          setError(null);
          setBusy('remove');
          void removeStudent({ id: student.id, studentId: student.studentId })
            .then(() => onRemoved())
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Could not remove the student.');
              setBusy(null);
            });
        },
      },
    ]);
  };

  const dirty = hasStudentEditChanges(student, fields);

  return (
    <View style={styles.container} testID="student-edit-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} testID="button-edit-back">
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Edit student</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Name *</Text>
        <TextInput
          style={styles.input}
          value={fields.name}
          onChangeText={(name) => set({ name })}
          placeholder="John Doe"
          autoCapitalize="words"
          testID="input-student-name"
        />
        <Text style={styles.label}>Grade</Text>
        <TextInput
          style={styles.input}
          value={fields.grade}
          onChangeText={(grade) => set({ grade })}
          placeholder="10"
          keyboardType="number-pad"
          testID="input-student-grade"
        />
        <Text style={styles.label}>Student ID</Text>
        <TextInput
          style={styles.input}
          value={fields.studentId}
          onChangeText={(studentId) => set({ studentId })}
          placeholder="Optional external ID"
          autoCapitalize="none"
          autoCorrect={false}
          testID="input-student-external-id"
        />

        {error ? (
          <Text style={styles.error} testID="student-edit-error">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.saveBtn, !dirty || busy ? styles.disabled : null]}
          onPress={handleSave}
          disabled={!dirty || busy !== null}
          testID="button-save-student"
        >
          {busy === 'save' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveText}>Save changes</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.removeBtn}
          onPress={handleRemove}
          disabled={busy !== null}
          testID="button-remove-student"
        >
          <Text style={styles.removeText}>
            {busy === 'remove' ? 'Removing…' : 'Remove student'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  back: { color: '#4361ee', fontSize: 17 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  headerSpacer: { width: 44 },
  content: { padding: 16, paddingBottom: 48 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1a1a2e',
  },
  error: { color: '#dc3545', marginTop: 12, fontSize: 14 },
  saveBtn: {
    backgroundColor: '#4361ee',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  removeBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dc3545',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginTop: 28,
  },
  removeText: { color: '#dc3545', fontWeight: '700', fontSize: 16 },
});
