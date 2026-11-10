import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { IWeekView } from '@scholaracle/contracts';
import type { IStatusSheetTarget } from './StatusSheet';
import { weekViewModel, type IWeekRowModel, type IWeekSectionModel } from './weekViewModel';

export interface IWeekViewProps {
  readonly view: IWeekView;
  onOpenAssignment(assignmentExternalId: string): void;
  onChangeStatus(target: IStatusSheetTarget): void;
}

/**
 * Presentational This week: Still owed, one block per day with work, Done this
 * week. Tap a row to open its work pack; tap the status chip to change it.
 * No grades UI.
 */
export function WeekView({
  view,
  onOpenAssignment,
  onChangeStatus,
}: IWeekViewProps): React.ReactElement {
  const model = weekViewModel(view);
  return (
    <View style={styles.body} testID={model.testId}>
      <Text style={styles.encouragement} testID="studio-encouragement">
        {model.encouragement}
      </Text>
      <Text style={styles.summary} testID="studio-week-summary">
        {model.summary}
      </Text>
      {model.emptyMessage !== null ? (
        <Text style={styles.empty} testID="studio-week-empty">
          {model.emptyMessage}
        </Text>
      ) : null}
      {model.sections.map((section) => (
        <WeekSection
          key={section.key}
          section={section}
          onOpenAssignment={onOpenAssignment}
          onChangeStatus={onChangeStatus}
        />
      ))}
      {model.done !== null ? (
        <View testID={model.done.testId}>
          <Text style={styles.sectionHeader}>{model.done.title}</Text>
          {model.done.rows.map((row) => (
            <TouchableOpacity
              key={row.assignmentExternalId}
              style={styles.doneRow}
              onPress={() => onOpenAssignment(row.assignmentExternalId)}
              accessibilityRole="button"
              accessibilityLabel={row.accessibilityLabel}
              testID={`studio-week-done-${row.assignmentExternalId}`}
            >
              <Text style={styles.doneMark}>✓</Text>
              <View style={styles.rowBody}>
                <Text style={styles.doneTitle}>{row.title}</Text>
                <Text style={styles.meta}>
                  {row.courseName} · {row.detail}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function WeekSection({
  section,
  onOpenAssignment,
  onChangeStatus,
}: {
  readonly section: IWeekSectionModel;
  onOpenAssignment(assignmentExternalId: string): void;
  onChangeStatus(target: IStatusSheetTarget): void;
}): React.ReactElement {
  return (
    <View testID={section.testId}>
      <Text style={styles.sectionHeader}>{section.title}</Text>
      {section.rows.map((row) => (
        <WeekRow
          key={row.assignmentExternalId}
          row={row}
          onOpen={() => onOpenAssignment(row.assignmentExternalId)}
          onStatus={() =>
            onChangeStatus({
              assignmentExternalId: row.assignmentExternalId,
              title: row.title,
              currentStatus: row.studentStatus,
            })
          }
        />
      ))}
    </View>
  );
}

function WeekRow({
  row,
  onOpen,
  onStatus,
}: {
  readonly row: IWeekRowModel;
  onOpen(): void;
  onStatus(): void;
}): React.ReactElement {
  return (
    <View style={styles.row} testID={`studio-week-item-${row.assignmentExternalId}`}>
      <TouchableOpacity
        style={styles.rowMain}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={row.accessibilityLabel}
        accessibilityHint="Opens the work pack"
      >
        <Text style={styles.rowTitle}>{row.title}</Text>
        <Text style={styles.meta}>
          {row.courseName}
          {row.dueLabel !== null ? ` · ${row.dueLabel}` : ''}
        </Text>
        <View style={styles.chips}>
          <Text style={styles.schoolChip}>{row.humanStatus}</Text>
          {row.needs.map((need) => (
            <Text key={need.need} style={styles.needChip} accessibilityLabel={need.label}>
              {need.glyph} {need.label}
            </Text>
          ))}
        </View>
        {row.warning !== null ? (
          <Text style={styles.warning} testID="studio-week-warning">
            {row.warning}
          </Text>
        ) : null}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.statusChip}
        onPress={onStatus}
        accessibilityRole="button"
        accessibilityLabel={`Status: ${row.statusLabel}. Change status for ${row.title}`}
        testID={`studio-week-status-${row.assignmentExternalId}`}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.statusMark}>{row.statusMark}</Text>
        <Text style={styles.statusText}>{row.statusLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 20 },
  encouragement: { fontSize: 26, fontWeight: '600', color: '#1a1a2e', lineHeight: 32 },
  summary: { fontSize: 14, color: '#6c757d', marginTop: -8 },
  empty: { fontSize: 18, color: '#1a1a2e', paddingVertical: 12 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  rowMain: { flex: 1 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '500', color: '#1a1a2e' },
  meta: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  schoolChip: {
    fontSize: 12,
    color: '#495057',
    backgroundColor: '#f1f3f5',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  needChip: { fontSize: 12, color: '#495057', paddingVertical: 3 },
  warning: { fontSize: 13, color: '#b45309', marginTop: 6 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#4361ee',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 2,
  },
  statusMark: { fontSize: 14, color: '#4361ee' },
  statusText: { fontSize: 13, fontWeight: '600', color: '#4361ee' },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dee2e6',
  },
  doneMark: { fontSize: 18, color: '#2b8a3e', width: 24, textAlign: 'center' },
  doneTitle: { fontSize: 16, color: '#495057', textDecorationLine: 'line-through' },
});
