import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ITodayView } from '@scholaracle/contracts';
import { todayViewModel } from './todayViewModel';

export interface ITodayViewProps {
  readonly view: ITodayView;
  onOpenAssignment(assignmentExternalId: string): void;
}

/** Presentational Today home. No grades UI. */
export function TodayView({ view, onOpenAssignment }: ITodayViewProps): React.ReactElement {
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
          <TouchableOpacity
            style={styles.cta}
            onPress={() => onOpenAssignment(primary.assignmentExternalId)}
            testID="studio-primary-cta"
          >
            <Text style={styles.ctaText}>{primary.label}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {model.alsoToday.length > 0 ? (
        <View testID="studio-also-today">
          <Text style={styles.alsoHeader}>Also today</Text>
          {model.alsoToday.map((step) => (
            <TouchableOpacity
              key={step.assignmentExternalId}
              onPress={() => onOpenAssignment(step.assignmentExternalId)}
            >
              <Text style={styles.alsoItem}>
                {step.title}
                <Text style={styles.alsoCourse}> — {step.courseName}</Text>
              </Text>
            </TouchableOpacity>
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
  cta: {
    alignSelf: 'flex-start',
    backgroundColor: '#4361ee',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  alsoHeader: { fontSize: 13, fontWeight: '600', color: '#6c757d', marginBottom: 8 },
  alsoItem: { fontSize: 16, color: '#1a1a2e', paddingVertical: 8 },
  alsoCourse: { color: '#6c757d' },
});
