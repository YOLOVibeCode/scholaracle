/**
 * PlanScreen — read-only plan & usage. The app sells nothing in-app; the
 * "Manage plan on scholarmancy.com" links are offered on iOS to US-locale devices
 * only (same gate as OnboardingScreen: canLinkToWebPlans). Android and every other
 * locale see neutral text with no link.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { apiClient } from '../api/client';
import { STORE_LEGAL_URLS } from '../store/legalUrls';
import { canLinkToWebPlans, resolvedDeviceLocale } from '../utils/usStorefrontLocale';
import {
  buildPlanViewModel,
  planManageLinks,
  showsEffectivePlanNote,
  type IPlanViewModel,
  type PlanTone,
} from '../plan/planViewModel';

interface IPlanScreenProps {
  onBack(): void;
}

const TONE_COLOR: Readonly<Record<PlanTone, string>> = {
  ok: '#2b8a3e',
  warn: '#e67700',
  bad: '#dc3545',
};

export function PlanScreen({ onBack }: IPlanScreenProps): React.ReactElement {
  const [vm, setVm] = useState<IPlanViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canLinkOut = useMemo(() => canLinkToWebPlans(Platform.OS, resolvedDeviceLocale()), []);
  const manage = useMemo(() => planManageLinks(canLinkOut, STORE_LEGAL_URLS), [canLinkOut]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [subscription, students] = await Promise.all([
        apiClient.getSubscription(),
        apiClient.getStudents(),
      ]);
      setVm(buildPlanViewModel({ subscription, studentCount: students.length, now: new Date() }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load your plan.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container} testID="plan-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} testID="button-plan-back">
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Plan & usage</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <ActivityIndicator size="large" color="#4361ee" testID="plan-loading" />
        ) : null}

        {error ? (
          <View style={styles.card} testID="plan-error">
            <Text style={styles.cardTitle}>Could not load your plan</Text>
            <Text style={styles.muted}>{error}</Text>
            <TouchableOpacity
              style={styles.retry}
              onPress={() => void load()}
              testID="button-plan-retry"
            >
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {vm ? (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Plan</Text>
              <Text style={styles.planName} testID="plan-name">
                {vm.planLabel}
              </Text>
              <Text style={[styles.status, { color: TONE_COLOR[vm.tone] }]} testID="plan-status">
                {vm.statusText}
              </Text>
              {vm.daysLeftText ? (
                <Text style={styles.muted} testID="plan-days-left">
                  {vm.daysLeftText}
                </Text>
              ) : null}
              {showsEffectivePlanNote(vm) ? (
                <Text style={styles.muted} testID="plan-effective-note">
                  Limits of the {vm.effectivePlanLabel} plan apply right now.
                </Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Students</Text>
              <Text style={styles.planName} testID="plan-students">
                {vm.studentsText}
              </Text>
              {vm.atLimit ? (
                <Text style={styles.muted} testID="plan-at-limit">
                  You are at your student limit. To add another student, change your membership on
                  the web.
                </Text>
              ) : null}
            </View>

            {manage.links.map((link) => (
              <TouchableOpacity
                key={link.testID}
                style={styles.card}
                onPress={() => void Linking.openURL(link.url)}
                testID={link.testID}
              >
                <Text style={styles.linkText}>{link.label}</Text>
              </TouchableOpacity>
            ))}
            {manage.neutralText ? (
              <Text style={styles.muted} testID="plan-neutral-text">
                {manage.neutralText}
              </Text>
            ) : null}
          </>
        ) : null}
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
  back: { color: '#4361ee', fontSize: 17 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  headerSpacer: { width: 44 },
  content: { padding: 16, paddingBottom: 48 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1a1a2e', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '700', color: '#6c757d', textTransform: 'uppercase' },
  planName: { fontSize: 22, fontWeight: '700', color: '#1a1a2e', marginTop: 4 },
  status: { fontSize: 15, fontWeight: '600', marginTop: 4 },
  muted: { fontSize: 13, color: '#6c757d', marginTop: 6 },
  linkText: { color: '#4361ee', fontSize: 15, fontWeight: '600' },
  retry: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: '#4361ee',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
