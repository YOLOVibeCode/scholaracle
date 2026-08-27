import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { openURL } from 'expo-linking';
import type { IWorkPackView } from '@scholaracle/contracts';
import type { IStudioApi } from '../api/interfaces';
import { apiClient } from '../api/client';
import { WorkPackView } from '../studio/WorkPackView';
import { getSessionAssetCache } from '../studio/openCachedAsset';
import { openWorkPackPrimary } from '../studio/openWorkPackPrimary';

export interface IStudentWorkPackScreenProps {
  readonly assignmentExternalId: string;
  readonly studio?: IStudioApi;
  onBack(): void;
}

export function StudentWorkPackScreen({
  assignmentExternalId,
  studio = apiClient,
  onBack,
}: IStudentWorkPackScreenProps): React.ReactElement {
  const [pack, setPack] = useState<IWorkPackView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [opening, setOpening] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setPack(await studio.getStudioWorkPack(assignmentExternalId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load work pack');
    } finally {
      setIsLoading(false);
    }
  }, [assignmentExternalId, studio]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOpenPrimary = (): void => {
    if (pack == null || opening) return;
    setOpening(true);
    setOpenError(null);
    void (async (): Promise<void> => {
      try {
        const result = await openWorkPackPrimary({
          assignmentExternalId,
          pack,
          cache: getSessionAssetCache(),
          patchStatus: (id, status) => studio.patchStudioAssignmentStatus(id, status),
          present: async (): Promise<void> => {
            const url = pack.primaryAsset?.downloadUrl;
            if (url !== undefined && url !== '') {
              await openURL(url);
            }
          },
        });
        if (result.opened) {
          setPack({ ...pack, humanStatus: 'Working on it' });
        }
      } catch {
        setOpenError('Could not open the file right now.');
      } finally {
        setOpening(false);
      }
    })();
  };

  const handleOpenLink = (href: string): void => {
    void openURL(href).catch(() => {
      Alert.alert('Could not open link');
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Work pack</Text>
        <View style={styles.headerSpacer} />
      </View>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4361ee" />
        </View>
      ) : error != null ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <TouchableOpacity onPress={() => void load()}>
            <Text style={styles.retry}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : pack != null ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <WorkPackView
            view={pack}
            opening={opening}
            openError={openError}
            onOpenPrimary={handleOpenPrimary}
            onOpenLink={handleOpenLink}
          />
        </ScrollView>
      ) : null}
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  headerSpacer: { width: 44 },
  scroll: { padding: 24, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#dc3545', textAlign: 'center', marginBottom: 12 },
  retry: { color: '#4361ee', fontWeight: '600' },
});
