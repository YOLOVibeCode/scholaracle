import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type {
  IStudentStatusUpdateResponse,
  ITodayView,
  IWeekView,
  StudentStatus,
} from '@scholaracle/contracts';
import { applyStudentStatusLocally, submitWithRollback } from '@scholaracle/studio-core';
import type { IStudioApi } from '../api/interfaces';
import { apiClient } from '../api/client';
import { TodayView } from '../studio/TodayView';
import { WeekView } from '../studio/WeekView';
import { StatusSheet, type IStatusSheetTarget } from '../studio/StatusSheet';
import {
  ALL_STALE,
  STUDIO_TABS,
  headerTitle,
  markFresh,
  markOtherStale,
  needsLoad,
  type StaleMap,
  type StudioTab,
} from '../studio/studioTabs';

export type { StudioTab } from '../studio/studioTabs';

export interface ITodayScreenProps {
  readonly studio?: IStudioApi;
  /** Controlled by App nav so a push can land on This week. Defaults to Today. */
  readonly tab?: StudioTab;
  onSelectTab?(tab: StudioTab): void;
  onOpenAssignment(assignmentExternalId: string): void;
  onOpenSettings(): void;
}

interface ILoadState<T> {
  readonly view: T | null;
  readonly error: string | null;
  readonly isLoading: boolean;
}

const INITIAL: ILoadState<never> = { view: null, error: null, isLoading: true };

export function TodayScreen({
  studio = apiClient,
  tab = 'today',
  onSelectTab,
  onOpenAssignment,
  onOpenSettings,
}: ITodayScreenProps): React.ReactElement {
  const [today, setToday] = useState<ILoadState<ITodayView>>(INITIAL);
  const [week, setWeek] = useState<ILoadState<IWeekView>>(INITIAL);
  const [stale, setStale] = useState<StaleMap>(ALL_STALE);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetTarget, setSheetTarget] = useState<IStatusSheetTarget | null>(null);

  const loadToday = useCallback(async () => {
    setToday((s) => ({ ...s, isLoading: s.view === null, error: null }));
    try {
      setToday({ view: await studio.getStudioToday(), error: null, isLoading: false });
    } catch (err: unknown) {
      setToday((s) => ({
        view: s.view,
        error: err instanceof Error ? err.message : 'Could not load today',
        isLoading: false,
      }));
    }
  }, [studio]);

  const loadWeek = useCallback(async () => {
    setWeek((s) => ({ ...s, isLoading: s.view === null, error: null }));
    try {
      setWeek({ view: await studio.getStudioWeek(), error: null, isLoading: false });
    } catch (err: unknown) {
      setWeek((s) => ({
        view: s.view,
        error: err instanceof Error ? err.message : 'Could not load this week',
        isLoading: false,
      }));
    }
  }, [studio]);

  const load = useCallback(
    (which: StudioTab): Promise<void> => (which === 'week' ? loadWeek() : loadToday()),
    [loadToday, loadWeek]
  );

  // A tab fetches the first time it is shown, and again only after something made it stale.
  useEffect(() => {
    if (!needsLoad(stale, tab)) return;
    setStale((s) => markFresh(s, tab));
    void load(tab);
  }, [tab, stale, load]);

  const refresh = (): void => {
    setRefreshing(true);
    void load(tab).finally(() => setRefreshing(false));
  };

  const submitStatus = async (
    assignmentExternalId: string,
    status: StudentStatus,
    note?: string
  ): Promise<IStudentStatusUpdateResponse> => {
    let response: IStudentStatusUpdateResponse;
    try {
      // The row moves at once; a refused PATCH puts the snapshot back.
      response = await submitWithRollback<IWeekView, IStudentStatusUpdateResponse>({
        current: week.view,
        optimistic: (view) => applyStudentStatusLocally(view, assignmentExternalId, status),
        set: (view) => setWeek((s) => ({ ...s, view })),
        submit: () => studio.patchStudioAssignmentStatus(assignmentExternalId, status, note),
      });
    } catch (err: unknown) {
      // Rolled back already; ask the server for its copy, best effort.
      void load(tab);
      throw err;
    }
    void load(tab);
    setStale((s) => markOtherStale(s, tab));
    return response;
  };

  const active = tab === 'week' ? week : today;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {headerTitle(tab)}
        </Text>
        <TouchableOpacity
          onPress={onOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          testID="button-settings"
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          style={styles.settingsHit}
        >
          <Text style={styles.settingsIcon}>⚙︎</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist" testID="studio-tabs">
        {STUDIO_TABS.map((entry) => {
          const selected = entry.tab === tab;
          return (
            <TouchableOpacity
              key={entry.tab}
              style={[styles.tab, selected && styles.tabSelected]}
              onPress={() => onSelectTab?.(entry.tab)}
              accessibilityRole="tab"
              accessibilityLabel={entry.label}
              accessibilityState={{ selected }}
              testID={`studio-tab-${entry.tab}`}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                {entry.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {active.isLoading ? (
        <View style={styles.center} testID="studio-loading">
          <ActivityIndicator size="large" color="#4361ee" />
        </View>
      ) : active.error != null && active.view === null ? (
        <View style={styles.center} testID="studio-error">
          <Text style={styles.error}>{active.error}</Text>
          <TouchableOpacity
            onPress={() => void load(tab)}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            testID="studio-retry"
          >
            <Text style={styles.retry}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#4361ee" />
          }
        >
          {active.error != null ? (
            <Text style={styles.staleError} testID="studio-stale-error">
              {active.error}
            </Text>
          ) : null}
          {tab === 'week' && week.view !== null ? (
            <WeekView
              view={week.view}
              onOpenAssignment={onOpenAssignment}
              onChangeStatus={setSheetTarget}
            />
          ) : tab === 'today' && today.view !== null ? (
            <TodayView
              view={today.view}
              onOpenAssignment={onOpenAssignment}
              onChangeStatus={setSheetTarget}
            />
          ) : null}
        </ScrollView>
      )}
      <StatusSheet
        target={sheetTarget}
        onClose={() => setSheetTarget(null)}
        onSubmit={submitStatus}
      />
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
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  settingsHit: { padding: 8, marginRight: -8 },
  settingsIcon: { fontSize: 22, color: '#4361ee' },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  tab: { paddingVertical: 10, paddingHorizontal: 4, marginRight: 20 },
  tabSelected: { borderBottomWidth: 2, borderBottomColor: '#4361ee' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#6c757d' },
  tabTextSelected: { color: '#4361ee' },
  scroll: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc3545', textAlign: 'center', marginBottom: 12 },
  staleError: { color: '#dc3545', marginBottom: 12 },
  retry: { color: '#4361ee', fontWeight: '600' },
});
