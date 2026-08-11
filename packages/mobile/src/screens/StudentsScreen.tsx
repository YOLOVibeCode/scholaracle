/**
 * StudentsScreen — lists students on the account with sync status.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { apiClient, type IStudentListItem } from '../api/client';

interface IStudentsScreenProps {
  onSelectStudent(student: IStudentListItem): void;
  onAddSource(): void;
  onOpenSettings?(): void;
}

export function StudentsScreen({
  onSelectStudent,
  onAddSource,
  onOpenSettings,
}: IStudentsScreenProps): React.ReactElement {
  const [students, setStudents] = useState<IStudentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getStudents();
      setStudents([...data]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = (): void => {
    setIsRefreshing(true);
    void load(true);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4361ee" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Students</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.addButton} onPress={onAddSource}>
            <Text style={styles.addButtonText}>+ Connect Source</Text>
          </TouchableOpacity>
          {onOpenSettings && (
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={onOpenSettings}
              accessibilityLabel="Settings"
              testID="button-settings"
            >
              <Text style={styles.settingsIcon}>⚙︎</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Inline error for refresh failures while a stale list is showing;
          the empty-list error state below owns the zero-student case. */}
      {error && students.length > 0 && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={students}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={students.length === 0 ? styles.emptyContainer : undefined}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => onSelectStudent(item)}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.cardInfo}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardGrade}>
                {item.grade != null ? `Grade ${item.grade}` : ''}
                {item.grade != null && item.stats?.currentGPA != null ? '  ·  ' : ''}
                {/* currentGPA is a 0-100 grade average, not a 4.0-scale GPA. */}
                {item.stats?.currentGPA != null ? `Avg ${item.stats.currentGPA.toFixed(1)}` : ''}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          error ? (
            <View style={styles.empty} testID="students-error">
              <Text style={styles.emptyTitle}>Could not load students</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={() => void load()}>
                <Text style={styles.emptyButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No students yet</Text>
              <Text style={styles.emptyText}>Connect a school portal to start syncing data.</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={onAddSource}>
                <Text style={styles.emptyButtonText}>Connect Portal</Text>
              </TouchableOpacity>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#1a1a2e' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addButton: {
    backgroundColor: '#4361ee',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  settingsButton: { padding: 6 },
  settingsIcon: { fontSize: 22, color: '#6c757d' },
  error: { color: '#dc3545', padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4361ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  cardInfo: { flex: 1, marginLeft: 12 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  cardGrade: { fontSize: 14, color: '#6c757d', marginTop: 2 },
  chevron: { color: '#adb5bd', fontSize: 22 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  emptyText: { fontSize: 15, color: '#6c757d', textAlign: 'center', marginBottom: 24 },
  emptyButton: {
    backgroundColor: '#4361ee',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyButtonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
