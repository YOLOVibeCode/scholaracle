/**
 * DashboardScreen — student detail view with assignments, grades, and sync history.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { apiClient, type IAssignmentItem, type ISyncRunItem } from '../api/client';
import { ApiError } from '../api/ApiError';
import { formatDate, statusColor } from '../grades/format';
import type { ICourseGrade, ICourseGradeAssignment } from '@scholaracle/contracts';

interface IDashboardData {
  readonly assignments: IAssignmentItem[];
  readonly overallGPA: number | null;
  readonly grades: readonly ICourseGrade[];
  readonly recentRuns: ISyncRunItem[];
}

interface IDashboardScreenProps {
  /** Mongo `id` from GET /api/students — used for all API calls. */
  readonly studentId: string;
  readonly studentName: string;
  onSync(): void;
  onBack(): void;
  onOpenCourse(course: ICourseGrade): void;
  onOpenAssignmentFromTab(assignment: ICourseGradeAssignment, course: ICourseGrade): void;
  onRunHistory?(): void;
}

export function DashboardScreen({
  studentId,
  studentName,
  onSync,
  onBack,
  onOpenCourse,
  onOpenAssignmentFromTab,
  onRunHistory,
}: IDashboardScreenProps): React.ReactElement {
  const [data, setData] = useState<IDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assignments' | 'grades' | 'runs'>('grades');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      setError(null);
      try {
        const [assignmentsRes, gradesRes, runsRes] = await Promise.all([
          apiClient.getStudentAssignments(studentId),
          apiClient.getStudentGrades(studentId),
          apiClient.getStudentRuns(studentId),
        ]);
        setData({
          assignments: assignmentsRes,
          overallGPA: gradesRes.overallGPA ?? null,
          grades: gradesRes.courseGrades,
          recentRuns: runsRes,
        });
      } catch (err: unknown) {
        const message =
          err instanceof ApiError && err.requestId
            ? `${err.message} (ref: ${err.requestId})`
            : err instanceof Error
              ? err.message
              : 'Failed to load data';
        setError(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [studentId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const handleRefresh = (): void => {
    setIsRefreshing(true);
    void load(true);
  };

  // Double-tap guard: a fast second tap on Sync used to push two sync flows.
  const syncTapGuardRef = useRef(false);
  const handleSyncPress = (): void => {
    if (syncTapGuardRef.current) return;
    syncTapGuardRef.current = true;
    setTimeout(() => {
      syncTapGuardRef.current = false;
    }, 1000);
    onSync();
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
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{studentName}</Text>
        <View style={styles.headerActions}>
          {onRunHistory && (
            <TouchableOpacity style={styles.historyBtn} onPress={onRunHistory}>
              <Text style={styles.historyText}>Runs</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.syncBtn} onPress={handleSyncPress} testID="button-sync">
            <Text style={styles.syncText}>Sync</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        {(['grades', 'assignments', 'runs'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'grades' ? 'Grades' : tab === 'assignments' ? 'Assignments' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* No data at all: blocking error box replaces the content. */}
      {error && data === null && (
        <View style={styles.errorBox} testID="dashboard-error">
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stale data available: slim dismissible banner, content stays visible. */}
      {error && data !== null && (
        <View style={[styles.errorBox, styles.errorBanner]} testID="dashboard-error-banner">
          <Text style={styles.error} numberOfLines={2}>
            {error}
          </Text>
          <TouchableOpacity onPress={() => setError(null)} testID="dashboard-error-dismiss">
            <Text style={styles.dismissText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {data !== null && activeTab === 'assignments' && (
        <SectionList
          sections={groupAssignmentsByStatus(data?.assignments ?? [])}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const course = item.courseExternalId
              ? (data?.grades ?? []).find((g) => g.courseExternalId === item.courseExternalId)
              : undefined;
            const fullAssignment = course?.assignments.find(
              (a) => a.externalId === item.assignmentExternalId
            );
            const isTappable = course != null && fullAssignment != null;
            return (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={isTappable ? 0.7 : 1}
                onPress={() => {
                  if (isTappable) onOpenAssignmentFromTab(fullAssignment, course);
                }}
              >
                <View style={styles.cardRow}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={[styles.statusBadge, statusColor(item.status ?? '')]}>
                    {item.status ?? 'unknown'}
                  </Text>
                  {isTappable && <Text style={styles.chevron}>›</Text>}
                </View>
                {item.courseName && <Text style={styles.cardSub}>{item.courseName}</Text>}
                {item.dueAt && <Text style={styles.cardSub}>Due: {formatDate(item.dueAt)}</Text>}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {data !== null && activeTab === 'grades' && (
        <SectionList
          sections={[{ title: 'Grades', data: [...(data?.grades ?? [])] }]}
          keyExtractor={(item) => item.courseExternalId}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          ListHeaderComponent={
            data?.overallGPA != null ? (
              <View style={styles.gpaCard} testID="gpa-header">
                <Text style={styles.gpaLabel}>Overall</Text>
                <Text style={styles.gpaValue}>{data.overallGPA.toFixed(1)}</Text>
              </View>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => onOpenCourse(item)}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.courseName}</Text>
                <Text style={styles.gradeBadge}>
                  {item.letterGrade ??
                    (item.officialGrade != null ? `${item.officialGrade.toFixed(1)}%` : 'N/A')}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </View>
              <Text style={styles.cardSub}>
                {item.gradedAssignments}/{item.totalAssignments} graded
                {item.missingAssignments > 0 && (
                  <Text
                    style={styles.missingCount}
                  >{`  ·  ${item.missingAssignments} missing`}</Text>
                )}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      {data !== null && activeTab === 'runs' && (
        <SectionList
          sections={[{ title: 'Recent Syncs', data: data?.recentRuns ?? [] }]}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.provider}</Text>
                <Text style={[styles.statusBadge, runStatusColor(item.status)]}>{item.status}</Text>
              </View>
              <Text style={styles.cardSub}>{formatDate(item.startedAt)}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

function groupAssignmentsByStatus(
  items: IAssignmentItem[]
): Array<{ title: string; data: IAssignmentItem[] }> {
  const missing = items.filter((a) => a.status === 'missing');
  const upcoming = items.filter(
    (a) => a.status !== 'missing' && (!a.dueAt || new Date(a.dueAt) > new Date())
  );
  const past = items.filter(
    (a) => a.status !== 'missing' && a.dueAt && new Date(a.dueAt) <= new Date()
  );
  return [
    ...(missing.length > 0 ? [{ title: 'Missing', data: missing }] : []),
    ...(upcoming.length > 0 ? [{ title: 'Upcoming', data: upcoming }] : []),
    ...(past.length > 0 ? [{ title: 'Past', data: past }] : []),
  ];
}

function runStatusColor(status: string): { color: string } {
  // Server run statuses: started/uploaded are in-flight, committed is the
  // terminal success state, failed is the only true failure.
  if (status === 'success' || status === 'committed') return { color: '#28a745' };
  if (status === 'failed') return { color: '#dc3545' };
  return { color: '#6c757d' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4361ee',
  },
  historyText: { color: '#4361ee', fontWeight: '600', fontSize: 14 },
  syncBtn: {
    backgroundColor: '#4361ee',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  syncText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#4361ee' },
  tabText: { color: '#6c757d', fontWeight: '500' },
  tabTextActive: { color: '#4361ee', fontWeight: '700' },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a2e', marginRight: 8 },
  cardSub: { fontSize: 13, color: '#6c757d', marginTop: 3 },
  statusBadge: { fontSize: 12, fontWeight: '600' },
  gradeBadge: { fontSize: 16, fontWeight: '700', color: '#4361ee' },
  chevron: { color: '#adb5bd', fontSize: 22, marginLeft: 8 },
  missingCount: { color: '#dc3545' },
  error: { color: '#dc3545', flex: 1 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderColor: '#f5c2c7',
    borderWidth: 1,
    borderRadius: 10,
    margin: 16,
    padding: 12,
    gap: 12,
  },
  retryButton: {
    backgroundColor: '#4361ee',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  errorBanner: { marginVertical: 6, paddingVertical: 6 },
  dismissText: { color: '#4361ee', fontWeight: '600', fontSize: 13 },
  gpaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#4361ee',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  gpaLabel: { color: '#dbe2ff', fontSize: 14, fontWeight: '600' },
  gpaValue: { color: '#fff', fontSize: 24, fontWeight: '700' },
});
