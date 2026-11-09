/**
 * AlertsScreen — alert inbox: grouped list, severity filter, pull-to-refresh,
 * acknowledge. Logic lives in src/alerts/alertsViewModel.ts.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import type { IAlertListItem } from '@scholaracle/contracts';
import { apiClient } from '../api/client';
import {
  SEVERITY_FILTERS,
  a11yAlertLabel,
  alertTypeLabel,
  countActive,
  emptyStateText,
  formatAlertAge,
  groupAlerts,
  markAcknowledged,
  severityColor,
  severityLabel,
  type AlertSeverityFilter,
} from '../alerts/alertsViewModel';

interface IAlertsScreenProps {
  onBack(): void;
}

export function AlertsScreen({ onBack }: IAlertsScreenProps): React.ReactElement {
  const [alerts, setAlerts] = useState<readonly IAlertListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<AlertSeverityFilter>('all');

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      setAlerts(await apiClient.getAlerts());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load alerts');
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

  const handleAcknowledge = async (alertId: string): Promise<void> => {
    setPendingId(alertId);
    setActionError(null);
    try {
      await apiClient.acknowledgeAlert(alertId);
      setAlerts((prev) => markAcknowledged(prev, alertId, new Date()));
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not acknowledge alert');
    } finally {
      setPendingId(null);
    }
  };

  const sections = useMemo(() => groupAlerts(alerts, filter), [alerts, filter]);
  const activeCount = countActive(alerts);
  const now = new Date();

  return (
    <View style={styles.container} testID="alerts-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="button-alerts-back"
          style={styles.backTouch}
        >
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">
          Alerts{activeCount > 0 ? ` (${activeCount})` : ''}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
          accessibilityRole="tablist"
        >
          {SEVERITY_FILTERS.map((f) => {
            const selected = f === filter;
            return (
              <TouchableOpacity
                key={f}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setFilter(f)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                accessibilityLabel={`Show ${severityLabel(f)} alerts`}
                testID={`filter-${f}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {severityLabel(f)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {actionError && (
        <Text style={styles.actionError} accessibilityRole="alert" testID="alerts-action-error">
          {actionError}
        </Text>
      )}
      {error && alerts.length > 0 && <Text style={styles.actionError}>{error}</Text>}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4361ee" />
        </View>
      ) : (
        <SectionList
          sections={sections.map((s) => ({ ...s, data: [...s.data] }))}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View
              style={[styles.card, item.acknowledged && styles.cardDone]}
              accessible
              accessibilityLabel={a11yAlertLabel(item, now)}
              testID="alert-item"
            >
              <View style={styles.cardTop}>
                <View style={[styles.dot, { backgroundColor: severityColor(item.severity) }]} />
                <Text style={styles.cardType}>{alertTypeLabel(item.type)}</Text>
                <Text style={styles.cardAge}>{formatAlertAge(item.createdAt, now)}</Text>
              </View>
              <Text style={styles.cardMessage}>{item.message}</Text>
              {!item.acknowledged && (
                <TouchableOpacity
                  style={styles.ackButton}
                  onPress={() => void handleAcknowledge(item.id)}
                  disabled={pendingId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Acknowledge ${alertTypeLabel(item.type)} alert`}
                  accessibilityState={{
                    disabled: pendingId === item.id,
                    busy: pendingId === item.id,
                  }}
                  testID="button-acknowledge"
                >
                  <Text style={styles.ackText}>
                    {pendingId === item.id ? 'Saving…' : 'Acknowledge'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          ListEmptyComponent={
            error ? (
              <View style={styles.empty} testID="alerts-error">
                <Text style={styles.emptyTitle}>Could not load alerts</Text>
                <Text style={styles.emptyText}>{error}</Text>
                <TouchableOpacity
                  style={styles.retry}
                  onPress={() => void load()}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading alerts"
                  testID="button-alerts-retry"
                >
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.empty} testID="alerts-empty">
                <Text style={styles.emptyTitle}>{emptyStateText(filter).title}</Text>
                <Text style={styles.emptyText}>{emptyStateText(filter).body}</Text>
              </View>
            )
          }
        />
      )}
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
  backTouch: { minWidth: 44, minHeight: 44, justifyContent: 'center' },
  back: { color: '#4361ee', fontSize: 17 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  headerSpacer: { width: 44 },
  filters: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ced4da',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#4361ee', borderColor: '#4361ee' },
  chipText: { color: '#495057', fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingTop: 4 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginTop: 12,
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
  cardDone: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  cardType: { flex: 1, fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  cardAge: { fontSize: 12, color: '#6c757d' },
  cardMessage: { fontSize: 14, color: '#343a40', lineHeight: 20 },
  ackButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4361ee',
  },
  ackText: { color: '#4361ee', fontWeight: '600', fontSize: 14 },
  actionError: { color: '#dc3545', paddingHorizontal: 16, paddingVertical: 6, fontSize: 13 },
  empty: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6c757d', textAlign: 'center' },
  retry: {
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 20,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#4361ee',
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
