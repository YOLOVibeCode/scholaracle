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
  Linking,
} from 'react-native';
import type { IMySharingStudent } from '@scholaracle/contracts';
import { apiClient, type IStudentListItem } from '../api/client';
import { canEditStudent } from '../sharing/accessMatrix';
import { invitationBannerText } from '../sharing/invitationGroups';
import {
  anyShareable,
  emptyStudentsText,
  needsInviterNames,
  studentSubline,
} from '../sharing/studentsHome';
import {
  SET_PASSWORD_BANNER_ACTION,
  SET_PASSWORD_BANNER_TEXT,
  SET_PASSWORD_BANNER_TITLE,
  setPasswordBannerStore,
  shouldShowSetPasswordBanner,
} from '../auth/setPasswordBanner';
import { forgotPasswordUrl } from '../auth/forgotPasswordUrl';

interface IStudentsScreenProps {
  onSelectStudent(student: IStudentListItem): void;
  onAddSource(): void;
  onStartSetup?(): void;
  onOpenSettings?(): void;
  /** Long-press a student card to edit or remove that student (owner / admin only). */
  onEditStudent?(student: IStudentListItem): void;
  onOpenAlerts?(): void;
  /** Pending sharing invitations banner → Invitations screen. */
  onOpenInvitations?(): void;
  /** "Share with someone…" (shown when the viewer owns or manages a student). */
  onShare?(): void;
}

interface ISetPasswordState {
  readonly userId: string;
  readonly email: string;
}

export function StudentsScreen({
  onSelectStudent,
  onAddSource,
  onStartSetup,
  onOpenSettings,
  onEditStudent,
  onOpenAlerts,
  onOpenInvitations,
  onShare,
}: IStudentsScreenProps): React.ReactElement {
  const [students, setStudents] = useState<IStudentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);
  const [mine, setMine] = useState<readonly IMySharingStudent[] | null>(null);
  const [setPassword, setSetPassword] = useState<ISetPasswordState | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      // Invitations are secondary: a failing call must not blank the list.
      const [data, pending] = await Promise.all([
        apiClient.getStudents(),
        apiClient.getPendingSharingInvites().catch(() => []),
      ]);
      setStudents([...data]);
      setPendingInviteCount(pending.length);
      if (needsInviterNames(data)) {
        setMine(
          await apiClient
            .getMySharing()
            .then((view) => view.students)
            .catch(() => null)
        );
      }
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

  // "Set a password" for an account the server created from an invitation (random password).
  useEffect(() => {
    void (async (): Promise<void> => {
      const user = await apiClient.getSessionUser().catch(() => null);
      if (!user) return;
      const dismissed = await setPasswordBannerStore.isDismissed(user.id);
      if (shouldShowSetPasswordBanner(user, dismissed)) {
        setSetPassword({ userId: user.id, email: user.email });
      }
    })();
  }, []);

  const dismissSetPassword = (): void => {
    if (!setPassword) return;
    void setPasswordBannerStore.dismiss(setPassword.userId);
    setSetPassword(null);
  };

  const bannerText = invitationBannerText(pendingInviteCount);
  const listHeader =
    bannerText || setPassword ? (
      <View>
        {setPassword ? (
          <View style={styles.banner} testID="banner-set-password">
            <View style={styles.bannerBody}>
              <Text style={styles.bannerTitle}>{SET_PASSWORD_BANNER_TITLE}</Text>
              <Text style={styles.bannerText}>{SET_PASSWORD_BANNER_TEXT}</Text>
            </View>
            <View style={styles.bannerActions}>
              <TouchableOpacity
                onPress={() => void Linking.openURL(forgotPasswordUrl(setPassword.email))}
                accessibilityRole="button"
                testID="button-set-password"
              >
                <Text style={styles.bannerAction}>{SET_PASSWORD_BANNER_ACTION}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={dismissSetPassword}
                accessibilityRole="button"
                accessibilityLabel="Dismiss"
                testID="button-set-password-dismiss"
              >
                <Text style={styles.bannerDismiss}>Not now</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {bannerText && onOpenInvitations ? (
          <TouchableOpacity
            style={[styles.banner, styles.inviteBanner]}
            onPress={onOpenInvitations}
            accessibilityRole="button"
            accessibilityLabel={`${bannerText}. View invitations`}
            testID="banner-invitations"
          >
            <Text style={styles.inviteBannerText}>{bannerText}</Text>
            <Text style={styles.bannerAction} testID="button-view-invitations">
              View ›
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ) : null;

  const listFooter =
    onShare && anyShareable(students) ? (
      <TouchableOpacity
        style={styles.shareButton}
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel="Share a student with someone"
        testID="button-share-students"
      >
        <Text style={styles.shareButtonText}>Share with someone…</Text>
      </TouchableOpacity>
    ) : null;

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
    <View style={styles.container} testID="students-list">
      <View style={styles.header}>
        <Text style={styles.title}>Students</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={onAddSource}
            testID="button-connect-source"
          >
            <Text style={styles.addButtonText}>+ Connect Source</Text>
          </TouchableOpacity>
          {onOpenAlerts && (
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={onOpenAlerts}
              accessibilityRole="button"
              accessibilityLabel="Alerts"
              testID="button-alerts"
            >
              <Text style={styles.settingsIcon}>🔔</Text>
            </TouchableOpacity>
          )}
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
        ListHeaderComponent={listHeader}
        ListFooterComponent={listFooter}
        renderItem={({ item }) => {
          const editable = onEditStudent !== undefined && canEditStudent(item.access);
          const subline = studentSubline(item, mine);
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => onSelectStudent(item)}
              onLongPress={editable ? (): void => onEditStudent(item) : undefined}
              accessibilityHint={editable ? 'Long press to edit or remove' : undefined}
              testID="card-student"
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName} testID="text-student-name">
                  {item.name}
                </Text>
                <Text style={styles.cardGrade}>
                  {item.grade != null ? `Grade ${item.grade}` : ''}
                  {item.grade != null && item.stats?.currentGPA != null ? '  ·  ' : ''}
                  {/* currentGPA is a 0-100 grade average, not a 4.0-scale GPA. */}
                  {item.stats?.currentGPA != null ? `Avg ${item.stats.currentGPA.toFixed(1)}` : ''}
                </Text>
                {subline ? (
                  <Text style={styles.cardShared} testID="text-student-shared">
                    {subline}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          );
        }}
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
              <Text style={styles.emptyText}>{emptyStudentsText(pendingInviteCount)}</Text>
              <TouchableOpacity style={styles.emptyButton} onPress={onStartSetup ?? onAddSource}>
                <Text style={styles.emptyButtonText}>Get started</Text>
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
  cardShared: { fontSize: 13, color: '#4361ee', marginTop: 4, fontWeight: '600' },
  chevron: { color: '#adb5bd', fontSize: 22 },
  banner: {
    backgroundColor: '#fff8e1',
    borderColor: '#ffe08a',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
  },
  bannerBody: { marginBottom: 8 },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  bannerText: { fontSize: 13, color: '#495057', marginTop: 2 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  bannerAction: { color: '#4361ee', fontWeight: '700', fontSize: 14 },
  bannerDismiss: { color: '#6c757d', fontWeight: '600', fontSize: 14 },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eef1ff',
    borderColor: '#c7d0ff',
    minHeight: 48,
  },
  inviteBannerText: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  shareButton: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#4361ee',
    backgroundColor: '#fff',
  },
  shareButtonText: { color: '#4361ee', fontWeight: '600', fontSize: 15 },
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
