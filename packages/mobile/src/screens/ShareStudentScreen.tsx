/**
 * ShareStudentScreen — invite one adult to follow one or more students: email (required),
 * name, phone, label, "Can manage", the students the viewer may administer, and alert channels
 * (email + push on by default; text needs a phone). Sends one POST /api/sharing/invites and shows
 * the per-student outcome. When the server returns an SMS opt-in link, the inviter can pass it on
 * through the system share sheet: the person opts in themselves, nothing is texted before.
 * Logic: src/sharing/shareForm.ts.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Share,
  ActivityIndicator,
} from 'react-native';
import type { ISharingInviteResult } from '@scholaracle/contracts';
import { apiClient, type IStudentListItem } from '../api/client';
import { canInvite } from '../sharing/accessMatrix';
import {
  SHARE_CHANNELS,
  SHARE_LABELS,
  buildShareInvite,
  initialShareForm,
  selectedSummary,
  shareFailureMessage,
  shareResultLines,
  shareSummary,
  smsOptInShareMessage,
  textChannelAvailable,
  toggleChannel,
  toggleStudent,
  type IShareFormState,
} from '../sharing/shareForm';

interface IShareStudentScreenProps {
  /** Preselected when opened from a student's Family & guardians screen. */
  readonly preselectStudentId?: string;
  onBack(): void;
  /** After the result is acknowledged; defaults to onBack. */
  onDone?(): void;
}

export function ShareStudentScreen({
  preselectStudentId,
  onBack,
  onDone,
}: IShareStudentScreenProps): React.ReactElement {
  const [students, setStudents] = useState<readonly IStudentListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<IShareFormState>(() => initialShareForm(preselectStudentId));
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<ISharingInviteResult | null>(null);

  useEffect(() => {
    apiClient
      .getStudents()
      .then((rows) => setStudents(rows.filter((row) => canInvite(row.access))))
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'Failed to load students')
      );
  }, []);

  const namesById = useMemo(
    () => new Map((students ?? []).map((s) => [s.id, s.name] as const)),
    [students]
  );

  const handleSend = async (): Promise<void> => {
    if (isSending) return;
    const built = buildShareInvite(form);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setError(null);
    setIsSending(true);
    try {
      setResult(await apiClient.sendSharingInvite(built.request));
    } catch (err: unknown) {
      setError(shareFailureMessage(err));
    } finally {
      setIsSending(false);
    }
  };

  const handleShareOptIn = (): void => {
    if (!result?.smsOptInUrl) return;
    void Share.share({
      message: smsOptInShareMessage({
        inviteeName: form.name,
        studentNames: form.studentIds.map((id) => namesById.get(id) ?? 'your student'),
        url: result.smsOptInUrl,
      }),
    }).catch(() => undefined);
  };

  const header = (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="Back"
        testID="button-share-back"
        style={styles.backTouch}
      >
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title} accessibilityRole="header">
        Share with someone
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (result) {
    const lines = shareResultLines(result, namesById);
    return (
      <View style={styles.container} testID="share-screen">
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card} testID="share-result">
            <Text style={styles.resultTitle}>{shareSummary(result)}</Text>
            {lines.map((line) => (
              <Text key={line.studentId} style={styles.resultLine}>
                {line.name}: <Text style={line.ok ? styles.ok : styles.muted}>{line.text}</Text>
              </Text>
            ))}
            <Text style={styles.hint}>
              The email has one button that signs them in; it works for 7 days. You can resend it
              from the student&apos;s Family &amp; guardians screen.
            </Text>
          </View>
          {result.smsOptInUrl ? (
            <View style={styles.card}>
              <Text style={styles.rowText}>Texts need their own OK</Text>
              <Text style={styles.hint}>
                Nothing is texted to {form.phone.trim()} until this person opts in themselves. Send
                them the opt-in link.
              </Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={handleShareOptIn}
                accessibilityRole="button"
                accessibilityLabel="Share the text opt-in link"
                testID="button-share-optin-link"
              >
                <Text style={styles.secondaryText}>Share opt-in link</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onDone ?? onBack}
            accessibilityRole="button"
            testID="button-share-done"
          >
            <Text style={styles.primaryText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="share-screen">
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Email *</Text>
        <TextInput
          style={styles.input}
          value={form.email}
          onChangeText={(email) => setForm({ ...form, email })}
          placeholder="name@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          testID="input-share-email"
        />
        <Text style={styles.label}>Name</Text>
        <TextInput
          style={styles.input}
          value={form.name}
          onChangeText={(name) => setForm({ ...form, name })}
          placeholder="Optional"
          autoCapitalize="words"
          testID="input-share-name"
        />
        <Text style={styles.label}>Phone (for texts)</Text>
        <TextInput
          style={styles.input}
          value={form.phone}
          onChangeText={(phone) => setForm({ ...form, phone })}
          placeholder="Optional"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          testID="input-share-phone"
        />

        <Text style={styles.label}>Label</Text>
        <View style={styles.chips}>
          {SHARE_LABELS.map((option) => {
            const selected = form.label === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setForm({ ...form, label: option.value })}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                testID={`chip-share-label-${option.value}`}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {option.text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[styles.card, styles.row]}>
          <View style={styles.flex}>
            <Text style={styles.rowText}>Can manage</Text>
            <Text style={styles.hint}>
              Edit the student, connect portals, invite or remove people. Cannot remove the student.
            </Text>
          </View>
          <Switch
            value={form.isAdmin}
            onValueChange={(isAdmin) => setForm({ ...form, isAdmin })}
            accessibilityLabel="Can manage"
            testID="switch-share-admin"
          />
        </View>

        <Text style={styles.label}>Students</Text>
        {loadError ? (
          <Text style={styles.error} testID="share-students-error">
            {loadError}
          </Text>
        ) : students === null ? (
          <ActivityIndicator color="#4361ee" />
        ) : students.length === 0 ? (
          <Text style={styles.hint} testID="share-students-empty">
            You can only share students you own or manage.
          </Text>
        ) : (
          <View style={styles.card}>
            {students.map((student) => {
              const checked = form.studentIds.includes(student.id);
              return (
                <TouchableOpacity
                  key={student.id}
                  style={styles.checkRow}
                  onPress={() => setForm(toggleStudent(form, student.id))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={student.name}
                  testID="check-share-student"
                >
                  <Text style={[styles.checkBox, checked && styles.checkBoxOn]}>
                    {checked ? '✓' : ''}
                  </Text>
                  <Text style={styles.rowText}>{student.name}</Text>
                </TouchableOpacity>
              );
            })}
            <Text style={styles.hint} testID="text-share-selected">
              {selectedSummary(form, namesById)}
            </Text>
          </View>
        )}

        <Text style={styles.label}>Alerts</Text>
        <View style={styles.card}>
          {SHARE_CHANNELS.map((channel) => {
            const isText = channel.value === 'sms';
            const available = !isText || textChannelAvailable(form);
            return (
              <View key={channel.value} style={styles.row}>
                <View style={styles.flex}>
                  <Text style={[styles.rowText, !available && styles.mutedText]}>
                    {channel.text}
                  </Text>
                  {isText ? (
                    <Text style={styles.hint}>
                      {available
                        ? 'They opt in themselves before any text is sent.'
                        : 'Add a phone number to offer texts.'}
                    </Text>
                  ) : null}
                </View>
                <Switch
                  value={form.channels.includes(channel.value)}
                  onValueChange={() => setForm(toggleChannel(form, channel.value))}
                  disabled={!available}
                  accessibilityLabel={`Alerts by ${channel.text.toLowerCase()}`}
                  testID={`switch-share-channel-${channel.value}`}
                />
              </View>
            );
          })}
        </View>

        {error ? (
          <Text style={styles.error} accessibilityRole="alert" testID="share-error">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.primaryButton, isSending && styles.disabled]}
          onPress={() => void handleSend()}
          disabled={isSending}
          accessibilityRole="button"
          accessibilityLabel="Send invitation"
          accessibilityState={{ disabled: isSending, busy: isSending }}
          testID="button-share-send"
        >
          <Text style={styles.primaryText}>{isSending ? 'Sending…' : 'Send invitation'}</Text>
        </TouchableOpacity>
      </ScrollView>
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
  content: { padding: 16, paddingBottom: 48 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: '#1a1a2e',
  },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ced4da',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#4361ee', borderColor: '#4361ee' },
  chipText: { color: '#1a1a2e', fontWeight: '600', fontSize: 14 },
  chipTextSelected: { color: '#fff' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
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
  flex: { flex: 1, paddingRight: 12 },
  rowText: { fontSize: 15, color: '#1a1a2e' },
  mutedText: { color: '#adb5bd' },
  hint: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  checkRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 12 },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ced4da',
    textAlign: 'center',
    lineHeight: 22,
    color: '#fff',
    fontWeight: '700',
  },
  checkBoxOn: { backgroundColor: '#4361ee', borderColor: '#4361ee' },
  error: { color: '#dc3545', marginTop: 12, fontSize: 14 },
  primaryButton: {
    marginTop: 20,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#4361ee',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
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
  resultTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
  resultLine: { fontSize: 15, color: '#1a1a2e', marginTop: 4 },
  ok: { color: '#2b8a3e', fontWeight: '600' },
  muted: { color: '#6c757d' },
});
