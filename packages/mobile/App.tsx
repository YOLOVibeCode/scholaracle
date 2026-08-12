/**
 * Scholaracle Mobile App — Root component.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Alert } from 'react-native';
import { useLinkingURL } from 'expo-linking';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { StudentsScreen } from './src/screens/StudentsScreen';
import { ConnectSourceScreen } from './src/screens/ConnectSourceScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { CourseDetailScreen } from './src/screens/CourseDetailScreen';
import { AssignmentDetailScreen } from './src/screens/AssignmentDetailScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { RunHistoryScreen } from './src/screens/RunHistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { registerForPushNotifications, addResponseListener } from './src/notifications/pushSetup';
import { seedSecureStoreFromDevEnv } from './src/credentials/devCredentialSeed';
import { connectedSourceStore, type IConnectedSource } from './src/sources/ConnectedSourceStore';
import { type IStudentListItem } from './src/api/client';
import { isDemoDeepLink, DEMO_EMAIL, DEMO_PASSWORD } from './src/demo/demoLogin';
import type { ICourseGrade, ICourseGradeAssignment } from '@scholaracle/contracts';

type AppView =
  | 'students'
  | 'connect-source'
  | 'dashboard'
  | 'course-detail'
  | 'assignment-detail'
  | 'sync'
  | 'run-history'
  | 'settings';

interface INavState {
  readonly view: AppView;
  readonly student?: IStudentListItem;
  readonly syncSource?: IConnectedSource;
  readonly course?: ICourseGrade;
  readonly assignment?: ICourseGradeAssignment;
}

function AppContent(): React.ReactElement {
  const { isLoggedIn, isLoading, login, accountEpoch } = useAuth();
  const [nav, setNav] = useState<INavState>({ view: 'students' });
  const linkingUrl = useLinkingURL();
  const handledDemoUrl = useRef<string | null>(null);

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

  useEffect(() => {
    if (isLoggedIn) {
      void registerForPushNotifications();
      void seedSecureStoreFromDevEnv();
    }
  }, [isLoggedIn]);

  // Notification taps open the app at the students list (data refetches on
  // mount, so the fresh alert context is visible immediately).
  useEffect(() => {
    const subscription = addResponseListener(() => {
      setNav({ view: 'students' });
    });
    return () => subscription.remove();
  }, []);

  // Reset navigation when the session ends so the next login starts clean.
  useEffect(() => {
    if (!isLoggedIn) setNav({ view: 'students' });
  }, [isLoggedIn]);

  const startSync = useCallback(async (student: IStudentListItem) => {
    // Sources are keyed by the external (SIS/portal) student id.
    const source = student.studentId
      ? await connectedSourceStore.getForStudent(student.studentId)
      : null;
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

  if (isLoading) return <View style={styles.loading} />;
  if (!isLoggedIn) return <LoginScreen />;

  if (nav.view === 'connect-source') {
    return (
      <ConnectSourceScreen
        studentExternalId={nav.student?.studentId}
        studentId={nav.student?.id}
        onConnected={() =>
          setNav({ view: nav.student ? 'dashboard' : 'students', student: nav.student })
        }
        onCancel={() =>
          setNav({ view: nav.student ? 'dashboard' : 'students', student: nav.student })
        }
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
        </SafeAreaView>
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#f8f9fa' },
  safeArea: { flex: 1, backgroundColor: '#f8f9fa' },
});
