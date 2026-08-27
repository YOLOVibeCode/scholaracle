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
import { RunHistoryScreen } from './src/screens/RunHistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { TodayScreen } from './src/screens/TodayScreen';
import { StudentWorkPackScreen } from './src/screens/StudentWorkPackScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { registerForPushNotifications, addResponseListener } from './src/notifications/pushSetup';
import { seedSecureStoreFromDevEnv } from './src/credentials/devCredentialSeed';
import { connectedSourceStore, type IConnectedSource } from './src/sources/ConnectedSourceStore';
import { type IStudentListItem } from './src/api/client';
import { isDemoDeepLink, DEMO_EMAIL, DEMO_PASSWORD } from './src/demo/demoLogin';
import { isDiagDeepLink } from './src/demo/diagDeepLink';
import { installDiagCapture, log, openDiagPanel, unlockDiag } from './src/diag';
import { DebugOverlay } from './src/components/debug/DebugOverlay';
import { DeployStamp } from './src/components/DeployStamp';
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
import {
  clampNavView,
  homeViewForRole,
  isStudentSession,
  mayStorePortalCredentials,
  viewAfterNotificationTap,
  type AppNavView,
} from './src/studio/studentMode';

// Install capture taps once at module load — before any other code runs.
installDiagCapture();

type AppView = AppNavView;

interface INavState {
  readonly view: AppView;
  readonly student?: IStudentListItem;
  readonly syncSource?: IConnectedSource;
  readonly course?: ICourseGrade;
  readonly assignment?: ICourseGradeAssignment;
  readonly sourceInvite?: ISourceInvitePayload;
  readonly assignmentExternalId?: string;
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

  const applyInviteNav = useCallback((payload: ISourceInvitePayload): void => {
    const student: IStudentListItem = {
      id: payload.studentId,
      userId: '',
      name: payload.displayName,
      studentId: payload.studentExternalId,
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
      void seedSecureStoreFromDevEnv();
    }
  }, [isLoggedIn, studentMode, studentCount, role]);

  // Notification taps: parent → students list; student → Today.
  useEffect(() => {
    const subscription = addResponseListener(() => {
      setNav({ view: viewAfterNotificationTap(role) });
    });
    return () => subscription.remove();
  }, [role]);

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
    const source = await connectedSourceStore.getForStudentRecord(student);
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
          onBack={() => setNav({ view: 'today' })}
        />
      );
    }
    if (view === 'settings') {
      return <SettingsScreen hideHousehold onBack={() => setNav({ view: 'today' })} />;
    }
    return (
      <TodayScreen
        key={accountEpoch}
        onOpenAssignment={(assignmentExternalId) =>
          setNav({ view: 'work-pack', assignmentExternalId })
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
      />
    );
  }

  if (nav.view === 'course-detail' && nav.student && nav.course) {
    return (
      <CourseDetailScreen
        course={nav.course}
        onBack={() => setNav({ view: 'dashboard', student: nav.student })}
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
        config={{
          provider: nav.syncSource.provider,
          adapterId: nav.syncSource.adapterId,
          baseUrl: nav.syncSource.baseUrl,
          studentExternalId: nav.syncSource.studentExternalId,
          institutionExternalId: nav.syncSource.institutionExternalId,
          sourceId: nav.syncSource.sourceId,
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

  if (nav.view === 'settings') {
    return <SettingsScreen onBack={() => setNav({ view: 'students' })} />;
  }

  return (
    <StudentsScreen
      key={accountEpoch}
      onSelectStudent={(student) => setNav({ view: 'dashboard', student })}
      onAddSource={() => setNav({ view: 'connect-source' })}
      onStartSetup={() => setNav({ view: 'students' })}
      onOpenSettings={() => setNav({ view: 'settings' })}
    />
  );
}

export default function App(): React.ReactElement {
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
