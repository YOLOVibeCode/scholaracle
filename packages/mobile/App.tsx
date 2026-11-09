/**
 * Scholaracle Mobile App — Root component.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Alert } from 'react-native';
import { useLinkingURL } from 'expo-linking';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { StudentsScreen } from './src/screens/StudentsScreen';
import { OnboardingScreen } from './src/onboarding/OnboardingScreen';
import type { IApplyOnboardingResult } from './src/onboarding/applyOnboarding';
import { ConnectSourceScreen } from './src/screens/ConnectSourceScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { CourseDetailScreen } from './src/screens/CourseDetailScreen';
import { AssignmentDetailScreen } from './src/screens/AssignmentDetailScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { SyncAllScreen } from './src/screens/SyncAllScreen';
import { RunHistoryScreen } from './src/screens/RunHistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { PlanScreen } from './src/screens/PlanScreen';
import { StudentEditScreen } from './src/screens/StudentEditScreen';
import { AlertsScreen } from './src/screens/AlertsScreen';
import { NotificationSettingsScreen } from './src/screens/NotificationSettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { StudentWorkPackScreen } from './src/screens/StudentWorkPackScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { registerForPushNotifications } from './src/notifications/pushSetup';
import { usePushTapNavigation } from './src/notifications/usePushTapNavigation';
import { seedSecureStoreFromDevEnv } from './src/credentials/devCredentialSeed';
import { resavePortalCredentialsThisDeviceOnlyOnce } from './src/credentials/resavePortalCredentialsThisDeviceOnlyOnce';
import { connectedSourceStore, type IConnectedSource } from './src/sources/ConnectedSourceStore';
import { type IStudentListItem } from './src/api/client';
import { isDemoDeepLink, DEMO_EMAIL, DEMO_PASSWORD } from './src/demo/demoLogin';
import { isDiagDeepLink } from './src/demo/diagDeepLink';
import { extractMagicToken } from './src/auth/magicDeepLink';
import { installDiagCapture, log, openDiagPanel, unlockDiag } from './src/diag';
import { DebugOverlay } from './src/components/debug/DebugOverlay';
import { DeployStamp } from './src/components/DeployStamp';
import { AppRootGuard } from './src/launch/AppRootGuard';
import type {
  ICourseGrade,
  ICourseGradeAssignment,
  ISourceInvitePayload,
} from '@scholaracle/contracts';
import { handleInstallLink, redeemPendingInstall } from './src/install/handleInstallLink';
import { installSourceLinkParser } from './src/install/installSourceDeepLink';
import { pendingSourceInviteStore } from './src/install/pendingSourceInviteStore';
import { sourceInviteApplier } from './src/install/applySourceInvite';
import { apiClient } from './src/api/client';
import { fetchPendingSyncRequestsOnAppOpen } from './src/sync/pendingSyncOnAppOpen';
import { fetchServedSelectorPatchesOnAppOpen } from './src/sync/servedSelectorPatchesOnAppOpen';
import { extractHostname } from './src/utils/urlNormalize';
import {
  clampNavView,
  homeViewForRole,
  isStudentSession,
  mayStorePortalCredentials,
  type AppNavView,
} from './src/studio/studentMode';

// Install capture taps once at module load — before any other code runs.
installDiagCapture();

type AppView = AppNavView;

interface INavState {
  readonly view: AppView;
  readonly student?: IStudentListItem;
  readonly syncSource?: IConnectedSource;
  readonly syncAllSources?: readonly IConnectedSource[];
  readonly course?: ICourseGrade;
  readonly assignment?: ICourseGradeAssignment;
  readonly sourceInvite?: ISourceInvitePayload;
  readonly assignmentExternalId?: string;
  /** Where the student edit screen returns to. */
  readonly editReturn?: 'dashboard' | 'students';
  /** Which studio tab the work pack returns to. */
  readonly studioReturn?: 'today' | 'week';
}

function AppContent(): React.ReactElement {
  const { isLoggedIn, isLoading, login, accountEpoch, role } = useAuth();
  const studentMode = isStudentSession(role);
  const [loggedOutSurface, setLoggedOutSurface] = useState<'login' | 'onboarding'>('login');
  const [nav, setNav] = useState<INavState>({ view: 'students' });
  const [studentCount, setStudentCount] = useState<number | null>(null);
  const linkingUrl = useLinkingURL();
  const handledDemoUrl = useRef<string | null>(null);
  const handledDiagUrl = useRef<string | null>(null);
  const handledInstallUrl = useRef<string | null>(null);
  const handledMagicUrl = useRef<string | null>(null);

  // Trace navigation changes into the diag ring buffer.
  useEffect(() => {
    log('info', 'nav', nav.view);
  }, [nav.view]);

  // scholarmancy://diag — unlock and open the diagnostic overlay.
  useEffect(() => {
    if (!isDiagDeepLink(linkingUrl) || handledDiagUrl.current === linkingUrl) return;
    handledDiagUrl.current = linkingUrl ?? null;
    void unlockDiag().then(() => openDiagPanel());
  }, [linkingUrl]);

  // scholarmancy://demo — quick-login to the public demo account. No
  // pre-logout: a successful login overwrites the tokens anyway, and a
  // failed one must leave the existing session untouched.
  useEffect(() => {
    if (isLoading) return;
    if (!isDemoDeepLink(linkingUrl) || handledDemoUrl.current === linkingUrl) return;
    handledDemoUrl.current = linkingUrl ?? null;
    void (async (): Promise<void> => {
      try {
        await login(DEMO_EMAIL, DEMO_PASSWORD);
        setNav({ view: 'students' });
      } catch {
        Alert.alert('Demo unavailable', 'Could not sign in to the demo account right now.');
      }
    })();
  }, [isLoading, linkingUrl, login]);

  // scholarmancy://magic?token=<raw> — one-tap magic login sent via email/SMS.
  useEffect(() => {
    if (isLoading) return;
    const magicToken = extractMagicToken(linkingUrl);
    if (!magicToken || handledMagicUrl.current === linkingUrl) return;
    handledMagicUrl.current = linkingUrl ?? null;
    void (async (): Promise<void> => {
      try {
        await apiClient.loginWithMagicToken(magicToken);
        setNav({ view: 'students' });
      } catch {
        Alert.alert(
          'Link expired',
          'This login link has already been used or has expired. Ask your parent to send a new one.',
          [{ text: 'OK' }]
        );
      }
    })();
  }, [isLoading, linkingUrl]);

  const applyInviteNav = useCallback((payload: ISourceInvitePayload): void => {
    const student: IStudentListItem = {
      id: payload.studentId,
      userId: '',
      name: payload.displayName,
      studentId: payload.studentExternalId,
      // A source invite always comes from an owner/admin for their own student.
      access: 'owner',
      peopleCount: 1,
    };
    setNav({ view: 'connect-source', student, sourceInvite: payload });
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!installSourceLinkParser.isInstallSourceDeepLink(linkingUrl)) return;
    if (handledInstallUrl.current === linkingUrl) return;
    if (isLoggedIn && studentMode) return;
    handledInstallUrl.current = linkingUrl ?? null;
    void handleInstallLink(linkingUrl, {
      parser: installSourceLinkParser,
      pending: pendingSourceInviteStore,
      redeem: (token) => apiClient.redeemSourceInvite(token),
      apply: sourceInviteApplier,
      isLoggedIn,
      onApplied: (payload) => applyInviteNav(payload),
      onError: (message) => Alert.alert('Install link', message),
    });
  }, [isLoading, isLoggedIn, studentMode, linkingUrl, applyInviteNav]);

  useEffect(() => {
    if (isLoading || !isLoggedIn || studentMode) return;
    void redeemPendingInstall({
      pending: pendingSourceInviteStore,
      redeem: (token) => apiClient.redeemSourceInvite(token),
      apply: sourceInviteApplier,
      onApplied: (payload) => applyInviteNav(payload),
      onError: (message) => Alert.alert('Install link', message),
    });
  }, [isLoading, isLoggedIn, studentMode, applyInviteNav]);

  useEffect(() => {
    if (!isLoggedIn || studentMode) return;
    void fetchPendingSyncRequestsOnAppOpen(() => apiClient.getPendingSyncRequests()).catch(
      () => undefined
    );
  }, [isLoggedIn, studentMode, accountEpoch]);

  useEffect(() => {
    if (!isLoggedIn || studentMode) return;
    void (async (): Promise<void> => {
      try {
        const connectorToken = await apiClient.getOrMintConnectorToken();
        const sources = await apiClient.listIngestConnectorSources(connectorToken);
        const hosts = sources
          .map((s) => (s.portalBaseUrl ? extractHostname(s.portalBaseUrl) : ''))
          .filter((h) => h.length > 0);
        await fetchServedSelectorPatchesOnAppOpen(hosts, (portalHost) =>
          apiClient.getServedSelectorPatches(portalHost, connectorToken)
        );
      } catch {
        // Best-effort: sync still works without remote patches.
      }
    })();
  }, [isLoggedIn, studentMode, accountEpoch]);

  useEffect(() => {
    if (!isLoggedIn) {
      setStudentCount(null);
      return;
    }
    if (studentMode) {
      setStudentCount(0);
      return;
    }
    void apiClient
      .getStudents()
      .then((rows) => setStudentCount(rows.length))
      .catch(() => setStudentCount(0));
  }, [isLoggedIn, studentMode, accountEpoch]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (studentMode || (studentCount != null && studentCount > 0)) {
      void registerForPushNotifications();
    }
    if (mayStorePortalCredentials(role) && studentCount != null && studentCount > 0) {
      void (async (): Promise<void> => {
        await resavePortalCredentialsThisDeviceOnlyOnce();
        await seedSecureStoreFromDevEnv();
      })();
    }
  }, [isLoggedIn, studentMode, studentCount, role]);

  // Notification taps (live + cold start): open the student/course/assignment named in the push
  // data; student sessions and unroutable pushes land on the role's home.
  usePushTapNavigation({
    isLoading,
    isLoggedIn,
    role,
    accountEpoch,
    onNavigate: (next) => setNav(next),
  });

  // Reset navigation on login/logout so the next session starts on the right home.
  useEffect(() => {
    if (!isLoggedIn) {
      setNav({ view: 'students' });
      return;
    }
    setLoggedOutSurface('login');
    setNav({ view: homeViewForRole(role) });
  }, [isLoggedIn, accountEpoch, role]);

  const startSync = useCallback(async (student: IStudentListItem) => {
    // Never fail silently: this runs from a button as `void startSync()`, so a lookup
    // that hangs or throws used to leave the parent tapping Sync with no response.
    let source: IConnectedSource | null;
    try {
      source = await withTimeout(connectedSourceStore.getForStudentRecord(student), 5000);
    } catch (err) {
      Alert.alert(
        'Could not start sync',
        err instanceof Error ? err.message : 'Reading saved portals failed.'
      );
      return;
    }
    if (!source) {
      Alert.alert(
        'No portal connected',
        `Connect a school portal for ${student.name} first, then sync.`,
        [{ text: 'Connect', onPress: () => setNav({ view: 'connect-source', student }) }]
      );
      return;
    }
    setNav({ view: 'sync', student, syncSource: source });
  }, []);

  const finishOnboarding = useCallback(async (result: IApplyOnboardingResult) => {
    setStudentCount(result.students.length);
    const first = result.students[0];
    if (!first) {
      setNav({ view: 'students' });
      return;
    }
    const source = await connectedSourceStore.getForStudentRecord(first);
    if (source) {
      setNav({ view: 'sync', student: first, syncSource: source });
      return;
    }
    setNav({ view: 'dashboard', student: first });
  }, []);

  if (isLoading) return <View style={styles.loading} />;

  if (nav.view === 'connect-source' && !studentMode) {
    return (
      <ConnectSourceScreen
        studentExternalId={nav.sourceInvite?.studentExternalId ?? nav.student?.studentId}
        studentId={nav.sourceInvite?.studentId ?? nav.student?.id}
        invite={nav.sourceInvite}
        onConnected={() =>
          setNav({ view: nav.student ? 'dashboard' : 'students', student: nav.student })
        }
        onCancel={() =>
          setNav({ view: nav.student ? 'dashboard' : 'students', student: nav.student })
        }
      />
    );
  }

  if (!isLoggedIn) {
    if (loggedOutSurface === 'onboarding') {
      return (
        <OnboardingScreen
          entry="logged-out"
          onComplete={(result) => {
            void finishOnboarding(result);
          }}
        />
      );
    }
    return (
      <LoginScreen
        onCreateAccount={() => {
          setLoggedOutSurface('onboarding');
        }}
      />
    );
  }

  if (studentMode) {
    const view = clampNavView(role, nav.view);
    if (view === 'work-pack' && nav.assignmentExternalId) {
      return (
        <StudentWorkPackScreen
          assignmentExternalId={nav.assignmentExternalId}
          onBack={() => setNav({ view: nav.studioReturn ?? 'today' })}
        />
      );
    }
    if (view === 'settings') {
      return <SettingsScreen hideHousehold onBack={() => setNav({ view: 'today' })} />;
    }
    const studioTab = view === 'week' ? 'week' : 'today';
    return (
      <TodayScreen
        key={accountEpoch}
        tab={studioTab}
        onSelectTab={(tab) => setNav({ view: tab })}
        onOpenAssignment={(assignmentExternalId) =>
          setNav({ view: 'work-pack', assignmentExternalId, studioReturn: studioTab })
        }
        onOpenSettings={() => setNav({ view: 'settings' })}
      />
    );
  }

  if (studentCount === null) {
    return <View style={styles.loading} />;
  }

  if (studentCount === 0 && nav.view === 'students') {
    return (
      <OnboardingScreen
        entry="logged-in"
        onComplete={(result) => {
          void finishOnboarding(result);
        }}
      />
    );
  }

  if (nav.view === 'dashboard' && nav.student) {
    return (
      <DashboardScreen
        studentId={nav.student.id}
        studentName={nav.student.name}
        onSync={() => {
          void startSync(nav.student!);
        }}
        onBack={() => setNav({ view: 'students' })}
        onOpenCourse={(course) => setNav({ view: 'course-detail', student: nav.student, course })}
        onOpenAssignmentFromTab={(assignment, course) =>
          setNav({
            view: 'assignment-detail',
            student: nav.student,
            course,
            assignment,
          })
        }
        onRunHistory={() => setNav({ view: 'run-history', student: nav.student })}
        onEditStudent={() =>
          setNav({ view: 'student-edit', student: nav.student, editReturn: 'dashboard' })
        }
      />
    );
  }

  if (nav.view === 'course-detail' && nav.student && nav.course) {
    return (
      <CourseDetailScreen
        studentId={nav.student.id}
        course={nav.course}
        onBack={() => setNav({ view: 'dashboard', student: nav.student })}
        onCourseUpdated={(updatedCourse) =>
          setNav({ view: 'course-detail', student: nav.student, course: updatedCourse })
        }
        onOpenAssignment={(assignment) =>
          setNav({
            view: 'assignment-detail',
            student: nav.student,
            course: nav.course,
            assignment,
          })
        }
      />
    );
  }

  if (nav.view === 'assignment-detail' && nav.student && nav.course && nav.assignment) {
    return (
      <AssignmentDetailScreen
        studentId={nav.student.id}
        courseName={nav.course.courseName}
        assignment={nav.assignment}
        onBack={() => setNav({ view: 'course-detail', student: nav.student, course: nav.course })}
      />
    );
  }

  if (nav.view === 'sync' && nav.student && nav.syncSource) {
    return (
      <SyncScreen
        credentialKey={nav.syncSource.credentialKey}
        connectedSource={{
          ...nav.syncSource,
          studentId: nav.syncSource.studentId ?? nav.student.id,
        }}
        config={{
          provider: nav.syncSource.provider,
          adapterId: nav.syncSource.adapterId,
          baseUrl: nav.syncSource.baseUrl,
          studentExternalId: nav.syncSource.studentExternalId,
          institutionExternalId: nav.syncSource.institutionExternalId,
          sourceId: nav.syncSource.sourceId,
          studentNameHint: nav.student.name,
        }}
        onDone={() => setNav({ view: 'dashboard', student: nav.student })}
        onCancel={() => setNav({ view: 'dashboard', student: nav.student })}
      />
    );
  }

  if (nav.view === 'run-history') {
    return (
      <RunHistoryScreen
        onBack={() =>
          setNav({ view: nav.student ? 'dashboard' : 'students', student: nav.student })
        }
      />
    );
  }

  if (nav.view === 'plan') {
    return <PlanScreen onBack={() => setNav({ view: 'settings' })} />;
  }

  if (nav.view === 'student-edit' && nav.student) {
    const returnTo = nav.editReturn ?? 'students';
    return (
      <StudentEditScreen
        student={nav.student}
        onBack={() =>
          setNav(
            returnTo === 'dashboard'
              ? { view: 'dashboard', student: nav.student }
              : { view: 'students' }
          )
        }
        onSaved={(updated) =>
          setNav(
            returnTo === 'dashboard'
              ? { view: 'dashboard', student: updated }
              : { view: 'students' }
          )
        }
        onRemoved={() => {
          setNav({ view: 'students' });
          void apiClient
            .getStudents()
            .then((rows) => setStudentCount(rows.length))
            .catch(() => undefined);
        }}
      />
    );
  }

  if (nav.view === 'alerts') {
    return <AlertsScreen onBack={() => setNav({ view: 'students' })} />;
  }

  if (nav.view === 'notification-settings') {
    return <NotificationSettingsScreen onBack={() => setNav({ view: 'settings' })} />;
  }

  if (nav.view === 'settings') {
    return (
      <SettingsScreen
        onOpenPlan={() => setNav({ view: 'plan' })}
        onBack={() => setNav({ view: 'students' })}
        onOpenNotificationSettings={() => setNav({ view: 'notification-settings' })}
        onSyncAll={(grouped) => {
          if (grouped.length === 0) return;
          setNav({ view: 'sync-all', syncAllSources: grouped });
        }}
      />
    );
  }

  if (nav.view === 'sync-all' && nav.syncAllSources?.length) {
    const credentialKey = nav.syncAllSources[0]!.credentialKey;
    return (
      <SyncAllScreen
        credentialKey={credentialKey}
        items={nav.syncAllSources.map((source) => ({
          config: {
            provider: source.provider,
            adapterId: source.adapterId,
            baseUrl: source.baseUrl,
            studentExternalId: source.studentExternalId,
            institutionExternalId: source.institutionExternalId,
            sourceId: source.sourceId,
            adapterVersion: source.adapterVersion,
          },
          studentNameHint: source.studentExternalId,
          connectedSource: source,
        }))}
        onDone={() => setNav({ view: 'settings' })}
        onCancel={() => setNav({ view: 'settings' })}
      />
    );
  }

  return (
    <StudentsScreen
      key={accountEpoch}
      onSelectStudent={(student) => setNav({ view: 'dashboard', student })}
      onAddSource={() => setNav({ view: 'connect-source' })}
      onStartSetup={() => setNav({ view: 'students' })}
      onOpenSettings={() => setNav({ view: 'settings' })}
      onEditStudent={(student) => setNav({ view: 'student-edit', student, editReturn: 'students' })}
      onOpenAlerts={() => setNav({ view: 'alerts' })}
    />
  );
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out reading saved portals.')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    );
  });
}

export default function App(): React.ReactElement {
  return (
    <AppRootGuard>
      <AppRoot />
    </AppRootGuard>
  );
}

function AppRoot(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <AppContent />
          <DeployStamp />
        </SafeAreaView>
        <StatusBar style="auto" />
        {/* DebugOverlay is outside SafeAreaView so it floats over everything,
            but inside AuthProvider so AuthTrace can call useAuth(). */}
        <DebugOverlay />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#f8f9fa' },
  safeArea: { flex: 1, backgroundColor: '#f8f9fa' },
});
