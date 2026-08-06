/**
 * DashboardScreen — student detail view with assignments, grades, and sync history.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { apiClient } from '../api/client';

interface IAssignment {
  readonly _id: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status?: string;
  readonly courseName?: string;
  readonly courseExternalId?: string;
}

interface IGradeSnapshot {
  readonly _id: string;
  readonly courseExternalId: string;
  readonly asOfDate: string;
  readonly percentGrade?: number;
  readonly letterGrade?: string;
  readonly courseName?: string;
}

interface ISyncRun {
  readonly _id: string;
  readonly provider: string;
  readonly status: string;
  readonly startedAt: string;
  readonly opCount?: number;
}

interface IDashboardData {
  readonly assignments: IAssignment[];
  readonly grades: IGradeSnapshot[];
  readonly recentRuns: ISyncRun[];
}

interface IDashboardScreenProps {
  readonly studentExternalId: string;
  readonly studentName: string;
  onSync(): void;
  onBack(): void;
  onRunHistory?(): void;
}

export function DashboardScreen({
  studentExternalId,
  studentName,
  onSync,
  onBack,
  onRunHistory,
}: IDashboardScreenProps): React.ReactElement {
  const [data, setData] = useState<IDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'assignments' | 'grades' | 'runs'>('assignments');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setIsLoading(true);
      setError(null);
      try {
        const [assignmentsRes, gradesRes, runsRes] = await Promise.all([
          apiClient.getStudentAssignments(studentExternalId),
          apiClient.getStudentGrades(studentExternalId),
          apiClient.getStudentRuns(studentExternalId),
        ]);
        setData({
          assignments: assignmentsRes,
          grades: gradesRes,
          recentRuns: runsRes,
        });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [studentExternalId]
  );

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
          <TouchableOpacity style={styles.syncBtn} onPress={onSync}>
            <Text style={styles.syncText}>Sync</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.tabs}>
        {(['assignments', 'grades', 'runs'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'assignments' ? 'Assignments' : tab === 'grades' ? 'Grades' : 'History'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {activeTab === 'assignments' && (
        <SectionList
          sections={groupAssignmentsByStatus(data?.assignments ?? [])}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={[styles.statusBadge, statusColor(item.status)]}>
                  {item.status ?? 'unknown'}
                </Text>
              </View>
              {item.courseName && <Text style={styles.cardSub}>{item.courseName}</Text>}
              {item.dueAt && <Text style={styles.cardSub}>Due: {formatDate(item.dueAt)}</Text>}
            </View>
          )}
        />
      )}

      {activeTab === 'grades' && (
        <SectionList
          sections={[{ title: 'Current Grades', data: data?.grades ?? [] }]}
          keyExtractor={(item) => item._id}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.courseName ?? item.courseExternalId}</Text>
                <Text style={styles.gradeBadge}>
                  {item.letterGrade ??
                    (item.percentGrade != null ? `${item.percentGrade.toFixed(1)}%` : 'N/A')}
                </Text>
              </View>
              <Text style={styles.cardSub}>As of {item.asOfDate}</Text>
            </View>
          )}
        />
      )}

      {activeTab === 'runs' && (
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
              {item.opCount !== undefined && (
                <Text style={styles.cardSub}>{item.opCount} operations</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

function groupAssignmentsByStatus(
  items: IAssignment[]
): Array<{ title: string; data: IAssignment[] }> {
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function statusColor(status?: string): { color: string } {
  switch (status) {
    case 'missing':
      return { color: '#dc3545' };
    case 'late':
      return { color: '#fd7e14' };
    case 'graded':
      return { color: '#28a745' };
    case 'submitted':
      return { color: '#4361ee' };
    default:
      return { color: '#6c757d' };
  }
}

function runStatusColor(status: string): { color: string } {
  return status === 'success' ? { color: '#28a745' } : { color: '#dc3545' };
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
  error: { color: '#dc3545', padding: 16 },
});
