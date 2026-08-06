/**
 * Scholaracle Mobile App — Root component.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { LoginScreen } from './src/screens/LoginScreen';
import { StudentsScreen } from './src/screens/StudentsScreen';
import { ConnectSourceScreen } from './src/screens/ConnectSourceScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { SyncScreen } from './src/screens/SyncScreen';
import { RunHistoryScreen } from './src/screens/RunHistoryScreen';
import { registerForPushNotifications } from './src/notifications/pushSetup';
import { seedSecureStoreFromDevEnv } from './src/credentials/devCredentialSeed';
import { connectedSourceStore, type IConnectedSource } from './src/sources/ConnectedSourceStore';
import type { IStudentListItem } from './src/api/client';

type AppView = 'students' | 'connect-source' | 'dashboard' | 'sync' | 'run-history';

interface INavState {
  readonly view: AppView;
  readonly student?: IStudentListItem;
  readonly syncSource?: IConnectedSource;
}

function AppContent(): React.ReactElement {
  const { isLoggedIn, isLoading } = useAuth();
  const [nav, setNav] = useState<INavState>({ view: 'students' });

  useEffect(() => {
    if (isLoggedIn) {
      void registerForPushNotifications();
      void seedSecureStoreFromDevEnv();
    }
  }, [isLoggedIn]);

  const startSync = useCallback(async (student: IStudentListItem) => {
    const source = await connectedSourceStore.getForStudent(student.externalId);
    if (!source) {
      Alert.alert('No portal connected', 'Connect a school portal first, then sync.', [
        { text: 'Connect', onPress: () => setNav({ view: 'connect-source', student }) },
      ]);
      return;
    }
    setNav({ view: 'sync', student, syncSource: source });
  }, []);

  if (isLoading) return <View style={styles.loading} />;
  if (!isLoggedIn) return <LoginScreen />;

  if (nav.view === 'connect-source') {
    return (
      <ConnectSourceScreen
        studentExternalId={nav.student?.externalId}
        studentId={nav.student?._id}
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
        studentExternalId={nav.student.externalId}
        studentName={nav.student.name}
        onSync={() => {
          void startSync(nav.student!);
        }}
        onBack={() => setNav({ view: 'students' })}
        onRunHistory={() => setNav({ view: 'run-history', student: nav.student })}
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

  return (
    <StudentsScreen
      onSelectStudent={(student) => setNav({ view: 'dashboard', student })}
      onAddSource={() => setNav({ view: 'connect-source' })}
    />
  );
}

export default function App(): React.ReactElement {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppContent />
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#f8f9fa' },
});
