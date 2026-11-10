/**
 * InvitationsScreen — pending sharing invitations addressed to the signed-in adult, one card
 * per invitation (inviter, students, Accept / Decline). Logic: src/sharing/invitationGroups.ts.
 */

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
import { apiClient } from '../api/client';
import {
  acceptedMessage,
  groupPendingInvites,
  invitationSelection,
  invitationSubtitle,
  invitationTitle,
  type IInvitationCard,
} from '../sharing/invitationGroups';

interface IInvitationsScreenProps {
  onBack(): void;
  /** Fired after every accept or decline so the Students list and counts refresh. */
  onChanged?(): void;
}

export function InvitationsScreen({
  onBack,
  onChanged,
}: IInvitationsScreenProps): React.ReactElement {
  const [cards, setCards] = useState<readonly IInvitationCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);
    try {
      setCards(groupPendingInvites(await apiClient.getPendingSharingInvites()));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load invitations');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (card: IInvitationCard, kind: 'accept' | 'decline'): Promise<void> => {
    if (busyKey) return;
    setBusyKey(card.key);
    setError(null);
    try {
      const selection = invitationSelection(card);
      if (kind === 'accept') {
        await apiClient.acceptSharingInvites(selection);
        setNotice(acceptedMessage(card));
      } else {
        await apiClient.declineSharingInvites(selection);
        setNotice(null);
      }
      setCards((prev) => prev.filter((c) => c.key !== card.key));
      onChanged?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update the invitation');
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <View style={styles.container} testID="invitations-screen">
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="button-invitations-back"
          style={styles.backTouch}
        >
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} accessibilityRole="header">
          Invitations
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
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
                void load(true);
              }}
            />
          }
        >
          {error ? (
            <Text style={styles.error} accessibilityRole="alert" testID="invitations-error">
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text
              style={styles.notice}
              accessibilityLiveRegion="polite"
              testID="invitations-notice"
            >
              {notice}
            </Text>
          ) : null}
          {cards.length === 0 && !error ? (
            <View style={styles.empty} testID="invitations-empty">
              <Text style={styles.emptyTitle}>No pending invitations</Text>
              <Text style={styles.emptyText}>
                When someone shares a student with you, it shows up here.
              </Text>
            </View>
          ) : null}
          {cards.map((card) => {
            const busy = busyKey === card.key;
            return (
              <View key={card.key} style={styles.card} testID="invitation-card">
                <Text style={styles.cardTitle}>{invitationTitle(card)}</Text>
                <Text style={styles.cardSub}>{invitationSubtitle(card)}</Text>
                <View style={styles.names}>
                  {card.studentNames.map((name, i) => (
                    <Text key={`${card.key}-${i}`} style={styles.nameChip}>
                      {name}
                    </Text>
                  ))}
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity
                    style={[styles.primaryButton, busy && styles.disabled]}
                    onPress={() => void act(card, 'accept')}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Accept invitation from ${card.inviterName}`}
                    testID="button-accept-invitation"
                  >
                    <Text style={styles.primaryText}>{busy ? 'Working…' : 'Accept'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.secondaryButton, busy && styles.disabled]}
                    onPress={() => void act(card, 'decline')}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={`Decline invitation from ${card.inviterName}`}
                    testID="button-decline-invitation"
                  >
                    <Text style={styles.secondaryText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  error: { color: '#dc3545', marginBottom: 12, fontSize: 14 },
  notice: { color: '#2b8a3e', marginBottom: 12, fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6c757d', textAlign: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  cardSub: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  nameChip: {
    backgroundColor: '#eef1ff',
    color: '#4361ee',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#4361ee',
  },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ced4da',
  },
  secondaryText: { color: '#1a1a2e', fontWeight: '600', fontSize: 15 },
  disabled: { opacity: 0.45 },
});
