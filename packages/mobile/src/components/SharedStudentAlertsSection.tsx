/**
 * SharedStudentAlertsSection — inside Notification settings: one card per student SHARED with
 * the signed-in adult, with their own channels / types and a one-tap Silence. Each save writes
 * that person's contact row (PUT /api/students/:id/contacts/:email). Renders nothing when the
 * user follows no shared students.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { IMySharingStudent } from '@scholaracle/contracts';
import { apiClient } from '../api/client';
import { MyAlertsEditor } from './MyAlertsEditor';
import {
  buildContactPrefsUpdate,
  draftFromMyAlerts,
  type IMyAlertsDraft,
} from '../sharing/myAlertsModel';

interface ISharedAlertsState {
  readonly email: string;
  readonly students: readonly IMySharingStudent[];
}

export function SharedStudentAlertsSection(): React.ReactElement | null {
  const [state, setState] = useState<ISharedAlertsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [mine, user] = await Promise.all([
        apiClient.getMySharing(),
        apiClient.getSessionUser(),
      ]);
      setState({
        email: user?.email ?? '',
        students: mine.students.filter((s) => s.access !== 'owner'),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load shared students');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) return <ActivityIndicator color="#4361ee" testID="shared-alerts-loading" />;
  if (error) {
    return (
      <Text style={styles.error} testID="shared-alerts-error">
        {error}
      </Text>
    );
  }
  if (!state || state.students.length === 0) return null;

  const saveFor =
    (student: IMySharingStudent) =>
    async (draft: IMyAlertsDraft): Promise<void> => {
      await apiClient.updateStudentContact(
        student.studentId,
        state.email,
        buildContactPrefsUpdate(draft)
      );
    };

  return (
    <View testID="shared-student-alerts">
      <Text style={styles.sectionHeader}>Shared with you</Text>
      {state.students.map((student) => (
        <View key={student.studentId} style={styles.card}>
          <Text style={styles.studentName}>{student.name}</Text>
          {student.invitedBy?.name ? (
            <Text style={styles.hint}>Shared by {student.invitedBy.name}</Text>
          ) : null}
          <MyAlertsEditor
            studentName={student.name}
            saved={draftFromMyAlerts(student.alerts)}
            testID={`shared-alerts-${student.studentId}`}
            save={saveFor(student)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  studentName: { fontSize: 16, fontWeight: '700', color: '#1a1a2e' },
  hint: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  error: { color: '#dc3545', marginTop: 12, fontSize: 14 },
});
