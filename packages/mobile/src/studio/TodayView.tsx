import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ITodayView } from '@scholaracle/contracts';
import type { IStatusSheetTarget } from './StatusSheet';
import { todayViewModel } from './todayViewModel';

export interface ITodayViewProps {
  readonly view: ITodayView;
  onOpenAssignment(assignmentExternalId: string): void;
  /** Opens the shared status sheet. Today rows do not know the current status. */
  onChangeStatus?(target: IStatusSheetTarget): void;
}

/** Presentational Today home. No grades UI. */
export function TodayView({
  view,
  onOpenAssignment,
  onChangeStatus,
}: ITodayViewProps): React.ReactElement {
  const model = todayViewModel(view);
  const primary = model.primary;
  return (
    <View style={styles.body} testID={model.testId}>
      <Text style={styles.encouragement} testID="studio-encouragement">
        {model.encouragement}
      </Text>
      {primary ? (
        <View testID="studio-next">
          <Text style={styles.title}>{primary.title}</Text>
          <View style={styles.ctaRow}>
            <TouchableOpacity
              style={styles.cta}
              onPress={() => onOpenAssignment(primary.assignmentExternalId)}
              accessibilityRole="button"
              accessibilityLabel={primary.label}
              testID="studio-primary-cta"
            >
              <Text style={styles.ctaText}>{primary.label}</Text>
            </TouchableOpacity>
            {onChangeStatus ? (
              <TouchableOpacity
                style={styles.statusButton}
                onPress={() =>
                  onChangeStatus({
                    assignmentExternalId: primary.assignmentExternalId,
                    title: primary.title,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Change status for ${primary.title}`}
                testID="studio-primary-status"
              >
                <Text style={styles.statusText}>Status</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      {model.alsoToday.length > 0 ? (
        <View testID="studio-also-today">
          <Text style={styles.alsoHeader}>Also today</Text>
          {model.alsoToday.map((step) => (
            <View key={step.assignmentExternalId} style={styles.alsoRow}>
              <TouchableOpacity
                style={styles.alsoMain}
                onPress={() => onOpenAssignment(step.assignmentExternalId)}
                accessibilityRole="button"
                accessibilityLabel={`${step.title}, ${step.courseName}`}
                accessibilityHint="Opens the work pack"
              >
                <Text style={styles.alsoItem}>
                  {step.title}
                  <Text style={styles.alsoCourse}> — {step.courseName}</Text>
                </Text>
              </TouchableOpacity>
              {onChangeStatus ? (
                <TouchableOpacity
                  onPress={() =>
                    onChangeStatus({
                      assignmentExternalId: step.assignmentExternalId,
                      title: step.title,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Change status for ${step.title}`}
                  testID={`studio-also-status-${step.assignmentExternalId}`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.statusText}>Status</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 24 },
  encouragement: { fontSize: 28, fontWeight: '600', color: '#1a1a2e', lineHeight: 34 },
  title: { fontSize: 20, fontWeight: '500', color: '#1a1a2e', marginBottom: 12 },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: '#4361ee',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  statusButton: { paddingVertical: 14 },
  statusText: { color: '#4361ee', fontSize: 15, fontWeight: '600' },
  alsoHeader: { fontSize: 13, fontWeight: '600', color: '#6c757d', marginBottom: 8 },
  alsoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  alsoMain: { flex: 1 },
  alsoItem: { fontSize: 16, color: '#1a1a2e', paddingVertical: 8 },
  alsoCourse: { color: '#6c757d' },
});
