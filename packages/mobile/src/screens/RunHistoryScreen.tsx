/**
 * RunHistoryScreen — local run ledger viewer.
 *
 * Shows all past sync runs with status, phases, op counts, and version stamp.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { runLedger, type IRunEntry } from '../ledger/RunLedger';

interface IRunHistoryScreenProps {
  onBack(): void;
}

export function RunHistoryScreen({ onBack }: IRunHistoryScreenProps): React.ReactElement {
  const [runs, setRuns] = useState<IRunEntry[]>([]);
  const [selected, setSelected] = useState<IRunEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const all = await runLedger.getAll();
    setRuns(all);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (selected) {
    return <RunDetailView run={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Sync History</Text>
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4361ee" />
        </View>
      ) : runs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No sync runs yet</Text>
        </View>
      ) : (
        <FlatList
          data={runs}
          keyExtractor={(item) => item.runId}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.card} onPress={() => setSelected(item)}>
              <View style={styles.cardRow}>
                <Text style={styles.cardProvider}>{item.provider}</Text>
                <StatusChip status={item.status} />
              </View>
              <Text style={styles.cardTime}>{formatDate(item.startedAt)}</Text>
              <View style={styles.cardRow}>
                {item.opCount !== undefined && (
                  <Text style={styles.cardMeta}>{item.opCount} ops</Text>
                )}
                {item.elapsedMs !== undefined && (
                  <Text style={styles.cardMeta}>{(item.elapsedMs / 1000).toFixed(1)}s</Text>
                )}
              </View>
              {item.errorMessage && (
                <Text style={styles.cardError} numberOfLines={1}>
                  {item.errorMessage}
                </Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function RunDetailView({ run, onBack }: { run: IRunEntry; onBack(): void }): React.ReactElement {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Run Detail</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView contentContainerStyle={styles.detailContent}>
        <View style={styles.detailSection}>
          <View style={styles.cardRow}>
            <Text style={styles.detailLabel}>Provider</Text>
            <Text style={styles.detailValue}>{run.provider}</Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.detailLabel}>Status</Text>
            <StatusChip status={run.status} />
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.detailLabel}>Started</Text>
            <Text style={styles.detailValue}>{formatDate(run.startedAt)}</Text>
          </View>
          {run.completedAt && (
            <View style={styles.cardRow}>
              <Text style={styles.detailLabel}>Completed</Text>
              <Text style={styles.detailValue}>{formatDate(run.completedAt)}</Text>
            </View>
          )}
          {run.elapsedMs !== undefined && (
            <View style={styles.cardRow}>
              <Text style={styles.detailLabel}>Duration</Text>
              <Text style={styles.detailValue}>{(run.elapsedMs / 1000).toFixed(1)}s</Text>
            </View>
          )}
          {run.opCount !== undefined && (
            <View style={styles.cardRow}>
              <Text style={styles.detailLabel}>Operations</Text>
              <Text style={styles.detailValue}>{run.opCount}</Text>
            </View>
          )}
          {run.coreVersion && (
            <View style={styles.cardRow}>
              <Text style={styles.detailLabel}>Core ver.</Text>
              <Text style={styles.detailValue}>{run.coreVersion}</Text>
            </View>
          )}
          {run.adapterVersion && (
            <View style={styles.cardRow}>
              <Text style={styles.detailLabel}>Adapter ver.</Text>
              <Text style={styles.detailValue}>{run.adapterVersion}</Text>
            </View>
          )}
        </View>

        {run.errorMessage && (
          <View style={[styles.detailSection, styles.errorSection]}>
            <Text style={styles.sectionTitle}>Error</Text>
            <Text style={styles.errorText}>{run.errorMessage}</Text>
          </View>
        )}

        <View style={styles.detailSection}>
          <Text style={styles.sectionTitle}>Phases</Text>
          {run.phases.map((phase, i) => (
            <View key={i} style={styles.phaseRow}>
              <View style={styles.phaseLeft}>
                <Text style={styles.phaseName}>{phase.phase}</Text>
                <Text style={styles.phaseMsg}>{phase.message}</Text>
              </View>
              {phase.durationMs !== undefined && (
                <Text style={styles.phaseDuration}>{phase.durationMs}ms</Text>
              )}
            </View>
          ))}
          {run.phases.length === 0 && <Text style={styles.emptyText}>No phase data</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

function StatusChip({ status }: { status: string }): React.ReactElement {
  const color = status === 'success' ? '#28a745' : status === 'failed' ? '#dc3545' : '#fd7e14';
  return <Text style={[styles.chip, { color }]}>{status}</Text>;
}

function formatDate(iso: string): string {
  // Date never throws — invalid input yields an Invalid Date whose getTime()
  // is NaN (the old try/catch was dead code). Fall back to the raw string.
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  back: { color: '#4361ee', fontSize: 17, width: 60 },
  title: { fontSize: 18, fontWeight: '700', color: '#1a1a2e' },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardProvider: { fontSize: 16, fontWeight: '600', color: '#1a1a2e' },
  cardTime: { fontSize: 13, color: '#6c757d', marginBottom: 4 },
  cardMeta: { fontSize: 12, color: '#6c757d', marginRight: 12 },
  cardError: { fontSize: 12, color: '#dc3545', marginTop: 4 },
  chip: { fontSize: 12, fontWeight: '700' },
  emptyText: { color: '#6c757d', fontSize: 15 },
  detailContent: { padding: 16, gap: 12 },
  detailSection: { backgroundColor: '#fff', borderRadius: 10, padding: 14, gap: 8 },
  errorSection: { backgroundColor: '#fff5f5' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  detailLabel: { fontSize: 14, color: '#6c757d', width: 100 },
  detailValue: { fontSize: 14, color: '#1a1a2e', fontWeight: '500', flex: 1, textAlign: 'right' },
  errorText: { fontSize: 14, color: '#dc3545' },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  phaseLeft: { flex: 1 },
  phaseName: { fontSize: 13, fontWeight: '600', color: '#1a1a2e' },
  phaseMsg: { fontSize: 12, color: '#6c757d' },
  phaseDuration: { fontSize: 12, color: '#6c757d', marginLeft: 8 },
});
