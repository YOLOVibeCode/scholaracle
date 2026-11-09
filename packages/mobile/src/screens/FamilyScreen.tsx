/**
 * FamilyScreen — "Family & guardians" for one student: every adult with name, label,
 * Owner / Admin / Member chip, status and Texts chips, and role-aware actions (resend, make /
 * remove admin, remove, invite again) plus "My alerts" and "Leave" on the viewer's own row.
 * Controls the viewer's `access` does not allow are not rendered; the server enforces too.
 * Logic: src/sharing/familyViewModel.ts, src/sharing/myAlertsModel.ts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import type { ISharingPerson } from '@scholaracle/contracts';
import { apiClient, type IStudentListItem } from '../api/client';
import { canInvite } from '../sharing/accessMatrix';
import {
  adminChangeConfirmText,
  familyActionLabel,
  familyRows,
  familyTitle,
  isDestructiveAction,
  leaveConfirmText,
  peopleSummary,
  removePersonConfirmText,
  type FamilyAction,
  type IFamilyRow,
  type IFamilyViewer,
} from '../sharing/familyViewModel';
import {
  buildContactPrefsUpdate,
  draftFromPerson,
  type IMyAlertsDraft,
} from '../sharing/myAlertsModel';
import { MyAlertsEditor } from '../components/MyAlertsEditor';

interface IFamilyScreenProps {
  readonly student: IStudentListItem;
  onBack(): void;
  /** Opens the Share screen with this student preselected (owner / admin only). */
  onShare?(): void;
  /** The viewer left the student: return to the Students list and refresh it. */
  onLeft(): void;
}

export function FamilyScreen({
  student,
  onBack,
  onShare,
  onLeft,
}: IFamilyScreenProps): React.ReactElement {
  const [people, setPeople] = useState<readonly ISharingPerson[] | null>(null);
  const [viewer, setViewer] = useState<IFamilyViewer | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [alertsOpenFor, setAlertsOpenFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, user] = await Promise.all([
        apiClient.getStudentContacts(student.id),
        apiClient.getSessionUser(),
      ]);
      setPeople(rows);
      setViewer({ userId: user?.id ?? '', email: user?.email ?? '', access: student.access });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load people');
    } finally {
      setIsRefreshing(false);
    }
  }, [student.id, student.access]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, work: () => Promise<void>): Promise<void> => {
    if (busyKey) return;
    setBusyKey(key);
    setActionError(null);
    try {
      await work();
      await load();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Could not complete that action');
    } finally {
      setBusyKey(null);
    }
  };

  const confirmThen = (title: string, message: string, label: string, work: () => void): void => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: 'destructive', onPress: work },
    ]);
  };

  const resend = async (person: ISharingPerson): Promise<void> => {
    if (person.inviteGroupId) {
      await apiClient.resendSharingInvite(person.inviteGroupId);
    } else if (person.email) {
      // Older single-student entries have no group: send a 24 h sign-in link instead.
      await apiClient.sendStudentContactLoginLink(student.id, person.email, { channel: 'email' });
    }
    Alert.alert('Invitation sent', `A new email is on its way to ${person.email ?? 'them'}.`);
  };

  const reinvite = async (person: ISharingPerson): Promise<void> => {
    if (!person.email) return;
    await apiClient.sendSharingInvite({
      email: person.email,
      ...(person.name ? { name: person.name } : {}),
      label: person.role,
      isAdmin: person.isAdmin,
      studentIds: [student.id],
    });
  };

  const handleAction = (row: IFamilyRow, action: FamilyAction): void => {
    const person = row.person;
    const email = person.email ?? '';
    switch (action) {
      case 'my-alerts':
        setAlertsOpenFor((open) => (open === row.key ? null : row.key));
        return;
      case 'resend':
        void run(row.key, () => resend(person));
        return;
      case 'reinvite':
        void run(row.key, () => reinvite(person));
        return;
      case 'make-admin':
      case 'remove-admin': {
        const makeAdmin = action === 'make-admin';
        confirmThen(
          familyActionLabel(action),
          adminChangeConfirmText(row.displayName, makeAdmin),
          familyActionLabel(action),
          () =>
            void run(row.key, () =>
              apiClient.setStudentContactAdmin(student.id, email, makeAdmin).then(() => undefined)
            )
        );
        return;
      }
      case 'remove':
        confirmThen(
          `Remove ${row.displayName}?`,
          removePersonConfirmText(row.displayName, student.name),
          'Remove',
          () => void run(row.key, () => apiClient.removeStudentContact(student.id, email))
        );
        return;
      case 'leave':
        confirmThen(`Leave ${student.name}?`, leaveConfirmText(student.name), 'Leave', () => {
          void run(row.key, async () => {
            await apiClient.leaveStudent(student.id);
            onLeft();
          });
        });
        return;
      default:
        return;
    }
  };

  const saveMyAlerts =
    (row: IFamilyRow) =>
    async (draft: IMyAlertsDraft): Promise<void> => {
      const body = buildContactPrefsUpdate(draft);
      if (row.person.isOwner) {
        await apiClient.updateOwnerAlertPrefs(student.id, body);
      } else if (row.person.email) {
        await apiClient.updateStudentContact(student.id, row.person.email, body);
      }
    };

  const rows = people && viewer ? familyRows(people, viewer) : [];
  const showShare = onShare !== undefined && canInvite(student.access);

  return (
    <View style={styles.container} testID="family-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="button-family-back"
          style={styles.backTouch}
        >
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          Family &amp; guardians
        </Text>
        {showShare ? (
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={onShare}
            accessibilityRole="button"
            accessibilityLabel={`Share ${student.name} with someone`}
            testID="button-family-share"
          >
            <Text style={styles.shareText}>Share +</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {people === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4361ee" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void load();
              }}
            />
          }
        >
          <Text style={styles.subtitle}>{familyTitle(student.name)}</Text>
          {people ? <Text style={styles.hint}>{peopleSummary(people)}</Text> : null}
          {error ? (
            <View testID="family-error">
              <Text style={styles.error}>{error}</Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => void load()}
                accessibilityRole="button"
                testID="button-family-retry"
              >
                <Text style={styles.secondaryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {actionError ? (
            <Text style={styles.error} accessibilityRole="alert" testID="family-action-error">
              {actionError}
            </Text>
          ) : null}

          {rows.map((row) => (
            <View key={row.key} style={styles.card} testID="family-row">
              <Text style={styles.name}>
                {row.displayName}
                {row.isYou ? <Text style={styles.you}> (you)</Text> : null}
              </Text>
              {row.secondary ? <Text style={styles.hint}>{row.secondary}</Text> : null}
              <View style={styles.chips}>
                <Text style={[styles.chip, styles.roleChip]} testID="chip-role">
                  {row.roleChip}
                </Text>
                <Text style={styles.chip}>{row.labelChip}</Text>
                {row.statusChip ? (
                  <Text style={[styles.chip, statusStyle(row.statusChip)]} testID="chip-status">
                    {row.statusChip}
                  </Text>
                ) : null}
                {row.textsChip ? (
                  <Text style={styles.chip} testID="chip-texts">
                    {row.textsChip}
                  </Text>
                ) : null}
              </View>
              {row.actions.length > 0 ? (
                <View style={styles.actions}>
                  {row.actions.map((action) => {
                    const busy = busyKey === row.key;
                    const destructive = isDestructiveAction(action);
                    return (
                      <TouchableOpacity
                        key={action}
                        style={[
                          styles.actionBtn,
                          destructive && styles.actionBtnDestructive,
                          busy && styles.disabled,
                        ]}
                        onPress={() => handleAction(row, action)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`${familyActionLabel(action)}: ${row.displayName}`}
                        testID={`button-family-${action}`}
                      >
                        <Text
                          style={[styles.actionText, destructive && styles.actionTextDestructive]}
                        >
                          {familyActionLabel(action)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
              {alertsOpenFor === row.key && row.actions.includes('my-alerts') ? (
                <MyAlertsEditor
                  studentName={student.name}
                  saved={draftFromPerson(row.person)}
                  testID="my-alerts"
                  save={saveMyAlerts(row)}
                />
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function statusStyle(status: 'Invited' | 'Accepted' | 'Declined'): { color: string } {
  if (status === 'Accepted') return { color: '#2b8a3e' };
  if (status === 'Declined') return { color: '#dc3545' };
  return { color: '#e8590c' };
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
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 72 },
  shareBtn: {
    minWidth: 72,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4361ee',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  shareText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  subtitle: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  hint: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  error: { color: '#dc3545', marginTop: 12, fontSize: 14 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  name: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  you: { color: '#6c757d', fontWeight: '400' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    backgroundColor: '#f1f3f5',
    color: '#495057',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  roleChip: { backgroundColor: '#eef1ff', color: '#4361ee' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: {
    minHeight: 40,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4361ee',
  },
  actionBtnDestructive: { borderColor: '#dc3545' },
  actionText: { color: '#4361ee', fontWeight: '600', fontSize: 14 },
  actionTextDestructive: { color: '#dc3545' },
  secondaryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4361ee',
  },
  secondaryText: { color: '#4361ee', fontWeight: '600', fontSize: 14 },
  disabled: { opacity: 0.45 },
});
