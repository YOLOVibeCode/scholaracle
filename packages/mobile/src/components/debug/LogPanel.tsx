import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { getEntries, subscribe } from '../../diag';
import type { DiagEntry, DiagTag } from '../../diag';
import {
  DIAG_ACCENT,
  DIAG_BG,
  DIAG_BG_ELEVATED,
  DIAG_BORDER,
  DIAG_DESTRUCTIVE,
  DIAG_TEXT_PRIMARY,
  DIAG_TEXT_SECONDARY,
  DIAG_TEXT_TERTIARY,
} from './diagTheme';

const TAGS: Array<DiagTag | 'all'> = ['all', 'nav', 'net', 'auth', 'sync', 'err', 'act'];

function levelColor(level: DiagEntry['level']): string {
  if (level === 'error') return DIAG_DESTRUCTIVE;
  if (level === 'warn') return '#f59e0b';
  if (level === 'debug') return DIAG_TEXT_TERTIARY;
  return DIAG_TEXT_SECONDARY;
}

export function LogPanel(): React.ReactElement {
  const [tag, setTag] = useState<DiagTag | 'all'>('all');
  const [rows, setRows] = useState<DiagEntry[]>(() => getEntries());

  useEffect(() => {
    const pull = (): void => setRows(tag === 'all' ? getEntries() : getEntries([tag]));
    pull();
    let raf = 0;
    const unsub = subscribe((): void => {
      if (raf) return;
      raf = requestAnimationFrame((): void => {
        raf = 0;
        pull();
      });
    });
    return (): void => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [tag]);

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        {TAGS.map((t) => (
          <Pressable
            key={t}
            onPress={() => setTag(t)}
            style={[styles.chip, tag === t && styles.chipOn]}
            testID={`btn-diag-filter-${t}`}
          >
            <Text style={[styles.chipText, tag === t && styles.chipTextOn]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      <FlatList
        data={[...rows].reverse()}
        keyExtractor={(item) => String(item.seq)}
        style={styles.list}
        testID="list-diag-log"
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={[styles.meta, { color: levelColor(item.level) }]}>
              {item.dt}ms {item.tag}
            </Text>
            <Text style={styles.msg} selectable>
              {item.msg}
              {item.data ? `\n${JSON.stringify(item.data)}` : ''}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: DIAG_BG },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    borderColor: DIAG_BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: DIAG_BG_ELEVATED,
  },
  chipOn: { backgroundColor: DIAG_ACCENT, borderColor: DIAG_ACCENT },
  chipText: { color: DIAG_TEXT_TERTIARY, fontSize: 11, fontWeight: '500' },
  chipTextOn: { color: '#fff' },
  list: { flex: 1 },
  row: {
    paddingVertical: 6,
    borderBottomColor: DIAG_BORDER,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  meta: { fontSize: 10, fontWeight: '500' },
  msg: { color: DIAG_TEXT_PRIMARY, fontSize: 11, marginTop: 2 },
});
