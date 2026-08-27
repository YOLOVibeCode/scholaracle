import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import type { ITodayView } from '@scholaracle/contracts';
import type { IStudioApi } from '../api/interfaces';
import { apiClient } from '../api/client';
import { TodayView } from '../studio/TodayView';

export interface ITodayScreenProps {
  readonly studio?: IStudioApi;
  onOpenAssignment(assignmentExternalId: string): void;
  onOpenSettings(): void;
}

export function TodayScreen({
  studio = apiClient,
  onOpenAssignment,
  onOpenSettings,
}: ITodayScreenProps): React.ReactElement {
  const [view, setView] = useState<ITodayView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setView(await studio.getStudioToday());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load today');
    } finally {
      setIsLoading(false);
    }
  }, [studio]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Today</Text>
        <TouchableOpacity
          onPress={onOpenSettings}
          accessibilityLabel="Settings"
          testID="button-settings"
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          style={styles.settingsHit}
        >
          <Text style={styles.settingsIcon}>⚙︎</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4361ee" />
        </View>
      ) : error != null ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => void load()}>
            <Text style={styles.retry}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : view != null ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <TodayView view={view} onOpenAssignment={onOpenAssignment} />
        </ScrollView>
      ) : null}
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  settingsHit: { padding: 8, marginRight: -8 },
  settingsIcon: { fontSize: 22, color: '#4361ee' },
  scroll: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc3545', textAlign: 'center', marginBottom: 12 },
  retry: { color: '#4361ee', fontWeight: '600' },
});
