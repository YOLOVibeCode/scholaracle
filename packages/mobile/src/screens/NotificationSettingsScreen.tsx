/**
 * NotificationSettingsScreen — push status (+ jump to OS settings), per-type
 * alert toggles, quiet hours, digests and timezone. Edits are drafted locally
 * and saved with one PUT /api/settings. Logic: src/alerts/notificationSettingsModel.ts.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Linking,
  AppState,
  ActivityIndicator,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { apiClient } from '../api/client';
import {
  ALERT_TYPE_KEYS,
  WEEKLY_REVIEW_SECTION_HINT,
  WEEKLY_REVIEW_SWITCH_LABEL,
  alertTypeToggleLabel,
  buildUpdate,
  deviceTimezone,
  draftFromSettings,
  formatTime12,
  isDirty,
  pushPermissionView,
  quietHoursSummary,
  setTypeEnabled,
  setWeeklyReviewEnabled,
  stepTime,
  timezoneMismatch,
  weeklyReviewRows,
  weeklyReviewToggleRequest,
  type INotificationDraft,
  type IWeeklyReviewRow,
} from '../alerts/notificationSettingsModel';
import { SharedStudentAlertsSection } from '../components/SharedStudentAlertsSection';

interface INotificationSettingsScreenProps {
  onBack(): void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const TIME_STEP_MINUTES = 30;

export function NotificationSettingsScreen({
  onBack,
}: INotificationSettingsScreenProps): React.ReactElement {
  const [saved, setSaved] = useState<INotificationDraft | null>(null);
  const [draft, setDraft] = useState<INotificationDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [osStatus, setOsStatus] = useState('unknown');
  // Weekly review copy switches (one per student) save on their own PUT, not with the Save button.
  const [weeklyRows, setWeeklyRows] = useState<readonly IWeeklyReviewRow[] | null>(null);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);
  const device = deviceTimezone();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const settings = await apiClient.getNotificationSettings();
      const next = draftFromSettings(settings, device);
      setSaved(next);
      setDraft(next);
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load settings');
    }
    // Best effort: the rest of the screen still works if the household list fails.
    try {
      setWeeklyRows(weeklyReviewRows(await apiClient.getMySharing()));
      setWeeklyError(null);
    } catch (err: unknown) {
      setWeeklyRows([]);
      setWeeklyError(err instanceof Error ? err.message : 'Could not load your students');
    }
  }, [device]);

  const toggleWeeklyReview = async (row: IWeeklyReviewRow, enabled: boolean): Promise<void> => {
    setWeeklyRows((rows) => (rows ? setWeeklyReviewEnabled(rows, row.studentId, enabled) : rows));
    setWeeklyError(null);
    try {
      const req = weeklyReviewToggleRequest(row, enabled);
      if (req.kind === 'owner') {
        await apiClient.updateOwnerAlertPrefs(req.studentId, req.body);
      } else {
        // The row is keyed by the invite address; the account email is only a fallback
        // (the server then matches the caller's own row by user id).
        const email = req.email ?? (await apiClient.getSessionUser())?.email;
        if (!email) throw new Error('Sign in again to change this');
        await apiClient.updateStudentContact(req.studentId, email, req.body);
      }
    } catch (err: unknown) {
      setWeeklyRows((rows) =>
        rows ? setWeeklyReviewEnabled(rows, row.studentId, !enabled) : rows
      );
      setWeeklyError(err instanceof Error ? err.message : 'Could not save that');
    }
  };

  const refreshOsStatus = useCallback(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) => setOsStatus(status))
      .catch(() => setOsStatus('unknown'));
  }, []);

  useEffect(() => {
    void load();
    refreshOsStatus();
    // Coming back from the OS settings app: re-read the permission.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshOsStatus();
    });
    return () => sub.remove();
  }, [load, refreshOsStatus]);

  const edit = (next: INotificationDraft): void => {
    setDraft(next);
    setSaveState('idle');
  };

  const handleSave = async (): Promise<void> => {
    if (!draft) return;
    setSaveState('saving');
    setSaveError(null);
    try {
      const settings = await apiClient.updateNotificationSettings(buildUpdate(draft));
      const next = draftFromSettings(settings, device);
      setSaved(next);
      setDraft(next);
      setSaveState('saved');
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Could not save settings');
      setSaveState('error');
    }
  };

  const perm = pushPermissionView(osStatus);
  const dirty = draft !== null && saved !== null && isDirty(draft, saved);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        testID="button-notification-settings-back"
        style={styles.backTouch}
      >
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title} accessibilityRole="header">
        Notifications
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (!draft) {
    return (
      <View style={styles.container} testID="notification-settings-screen">
        {header}
        <View style={styles.center}>
          {loadError ? (
            <View testID="notification-settings-error" style={styles.centerInner}>
              <Text style={styles.errorTitle}>Could not load settings</Text>
              <Text style={styles.hint}>{loadError}</Text>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => void load()}
                accessibilityRole="button"
                accessibilityLabel="Retry loading notification settings"
                testID="button-notification-settings-retry"
              >
                <Text style={styles.primaryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ActivityIndicator size="large" color="#4361ee" />
          )}
        </View>
      </View>
    );
  }

  const quiet = draft.quietHours;

  return (
    <View style={styles.container} testID="notification-settings-screen">
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionHeader}>Push notifications</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowText}>This device</Text>
            <Text style={styles.rowValue} testID="text-os-permission">
              {perm.label}
            </Text>
          </View>
          <Text style={styles.hint}>{perm.hint}</Text>
          {!perm.granted && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
              accessibilityLabel="Open device settings"
              testID="button-open-os-settings"
            >
              <Text style={styles.secondaryText}>Open device settings</Text>
            </TouchableOpacity>
          )}
          <View style={[styles.row, styles.rowTop]}>
            <Text style={styles.rowText}>Send push alerts</Text>
            <Switch
              value={draft.push}
              onValueChange={(push) => edit({ ...draft, push })}
              accessibilityLabel="Send push alerts"
              testID="switch-push"
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>Alert types</Text>
        <View style={styles.card}>
          {ALERT_TYPE_KEYS.map((key) => (
            <View key={key} style={styles.row}>
              <Text style={styles.rowText}>{alertTypeToggleLabel(key)}</Text>
              <Switch
                value={draft.types[key]?.enabled ?? true}
                onValueChange={(enabled) => edit(setTypeEnabled(draft, key, enabled))}
                accessibilityLabel={alertTypeToggleLabel(key)}
                testID={`switch-type-${key}`}
              />
            </View>
          ))}
        </View>

        {/* Students shared with this adult: their own channels / types per student, with Silence. */}
        <SharedStudentAlertsSection />

        <Text style={styles.sectionHeader}>Quiet hours</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.rowText}>Do not disturb</Text>
              <Text style={styles.hint}>{quietHoursSummary(quiet)}</Text>
            </View>
            <Switch
              value={quiet.enabled}
              onValueChange={(enabled) => edit({ ...draft, quietHours: { ...quiet, enabled } })}
              accessibilityLabel="Do not disturb"
              testID="switch-quiet-hours"
            />
          </View>
          {quiet.enabled && (
            <>
              <TimeStepper
                label="From"
                value={quiet.start}
                testID="quiet-start"
                onChange={(start) => edit({ ...draft, quietHours: { ...quiet, start } })}
              />
              <TimeStepper
                label="To"
                value={quiet.end}
                testID="quiet-end"
                onChange={(end) => edit({ ...draft, quietHours: { ...quiet, end } })}
              />
              <View style={[styles.row, styles.rowTop]}>
                <Text style={[styles.rowText, styles.flex]}>Let critical alerts through</Text>
                <Switch
                  value={quiet.criticalOverride}
                  onValueChange={(criticalOverride) =>
                    edit({ ...draft, quietHours: { ...quiet, criticalOverride } })
                  }
                  accessibilityLabel="Let critical alerts through quiet hours"
                  testID="switch-quiet-critical"
                />
              </View>
            </>
          )}
        </View>

        <Text style={styles.sectionHeader}>Email digests</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.rowText}>Daily digest</Text>
              <Text style={styles.hint}>{formatTime12(draft.dailyDigest.time)}</Text>
            </View>
            <Switch
              value={draft.dailyDigest.enabled}
              onValueChange={(enabled) =>
                edit({ ...draft, dailyDigest: { ...draft.dailyDigest, enabled } })
              }
              accessibilityLabel="Daily digest"
              testID="switch-daily-digest"
            />
          </View>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.rowText}>Weekly digest</Text>
              <Text style={styles.hint}>
                {capitalize(draft.weeklyDigest.day)}, {formatTime12(draft.weeklyDigest.time)}
              </Text>
            </View>
            <Switch
              value={draft.weeklyDigest.enabled}
              onValueChange={(enabled) =>
                edit({ ...draft, weeklyDigest: { ...draft.weeklyDigest, enabled } })
              }
              accessibilityLabel="Weekly digest"
              testID="switch-weekly-digest"
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>Weekly review</Text>
        <View style={styles.card} testID="section-weekly-review">
          <Text style={styles.hint}>{WEEKLY_REVIEW_SECTION_HINT}</Text>
          {weeklyRows !== null && weeklyRows.length === 0 && !weeklyError && (
            <Text style={[styles.hint, styles.rowTop]} testID="text-weekly-review-empty">
              No students yet.
            </Text>
          )}
          {(weeklyRows ?? []).map((row) => (
            <View key={row.studentId} style={[styles.row, styles.rowTop]}>
              <View style={styles.flex}>
                <Text style={styles.rowText}>{row.name}</Text>
                <Text style={styles.hint}>{WEEKLY_REVIEW_SWITCH_LABEL}</Text>
              </View>
              <Switch
                value={row.enabled}
                onValueChange={(enabled) => void toggleWeeklyReview(row, enabled)}
                accessibilityLabel={`${WEEKLY_REVIEW_SWITCH_LABEL} for ${row.name}`}
                testID={`switch-weekly-review-${row.studentId}`}
              />
            </View>
          ))}
          {weeklyError && (
            <Text
              style={styles.errorText}
              accessibilityRole="alert"
              testID="text-weekly-review-error"
            >
              {weeklyError}
            </Text>
          )}
        </View>

        <Text style={styles.sectionHeader}>Time zone</Text>
        <View style={styles.card}>
          <Text style={styles.rowText} testID="text-timezone">
            {draft.timezone}
          </Text>
          {timezoneMismatch(draft.timezone, device) && (
            <>
              <Text style={styles.hint}>This device is set to {device}.</Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => edit({ ...draft, timezone: device })}
                accessibilityRole="button"
                accessibilityLabel={`Use this device's time zone, ${device}`}
                testID="button-use-device-timezone"
              >
                <Text style={styles.secondaryText}>Use device time zone</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {saveState === 'error' && saveError && (
          <Text style={styles.errorText} accessibilityRole="alert" testID="text-save-error">
            {saveError}
          </Text>
        )}
        {saveState === 'saved' && (
          <Text style={styles.savedText} accessibilityLiveRegion="polite" testID="text-saved">
            Saved
          </Text>
        )}
        <TouchableOpacity
          style={[styles.primaryButton, (!dirty || saveState === 'saving') && styles.disabled]}
          onPress={() => void handleSave()}
          disabled={!dirty || saveState === 'saving'}
          accessibilityRole="button"
          accessibilityLabel="Save notification settings"
          accessibilityState={{
            disabled: !dirty || saveState === 'saving',
            busy: saveState === 'saving',
          }}
          testID="button-save-notification-settings"
        >
          <Text style={styles.primaryText}>{saveState === 'saving' ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ITimeStepperProps {
  readonly label: string;
  readonly value: string;
  readonly testID: string;
  onChange(next: string): void;
}

function TimeStepper({ label, value, testID, onChange }: ITimeStepperProps): React.ReactElement {
  return (
    <View style={[styles.row, styles.rowTop]}>
      <Text style={styles.rowText}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => onChange(stepTime(value, -TIME_STEP_MINUTES))}
          accessibilityRole="button"
          accessibilityLabel={`${label} earlier by 30 minutes`}
          testID={`${testID}-earlier`}
        >
          <Text style={styles.stepText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.timeText} testID={`${testID}-value`}>
          {formatTime12(value)}
        </Text>
        <TouchableOpacity
          style={styles.stepButton}
          onPress={() => onChange(stepTime(value, TIME_STEP_MINUTES))}
          accessibilityRole="button"
          accessibilityLabel={`${label} later by 30 minutes`}
          testID={`${testID}-later`}
        >
          <Text style={styles.stepText}>+</Text>
        </TouchableOpacity>
      </View>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerInner: { alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48 },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  rowTop: { marginTop: 4 },
  flex: { flex: 1, paddingRight: 12 },
  rowText: { fontSize: 15, color: '#1a1a2e' },
  rowValue: { fontSize: 15, fontWeight: '600', color: '#1a1a2e' },
  hint: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ced4da',
  },
  stepText: { fontSize: 20, color: '#4361ee', fontWeight: '700' },
  timeText: { minWidth: 88, textAlign: 'center', fontSize: 15, color: '#1a1a2e' },
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
  primaryButton: {
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#4361ee',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.45 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 6 },
  errorText: { color: '#dc3545', marginTop: 12, fontSize: 14 },
  savedText: { color: '#2b8a3e', marginTop: 12, fontSize: 14, fontWeight: '600' },
});
