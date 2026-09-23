/**
 * CourseDetailScreen — one course's grade hero, category breakdown, and
 * assignment list.
 *
 * Purely presentational: it receives the ICourseGrade DashboardScreen already
 * loaded — no data fetching happens here.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Button,
} from 'react-native';
import type { ICourseGrade, ICourseGradeAssignment } from '@scholaracle/contracts';
import { apiClient } from '../api/client';
import { formatDate, formatPoints, statusColor } from '../grades/format';
import {
  buildCategoryRollup,
  buildCourseDetailSections,
  rowKey,
  sectionKindFor,
  type ICourseDetailSection,
} from '../grades/gradeBreakdown';

interface ICourseDetailScreenProps {
  readonly studentId: string;
  readonly course: ICourseGrade;
  onBack(): void;
  onOpenAssignment(assignment: ICourseGradeAssignment): void;
  onCourseUpdated(course: ICourseGrade): void;
}

export function CourseDetailScreen({
  studentId,
  course,
  onBack,
  onOpenAssignment,
  onCourseUpdated,
}: ICourseDetailScreenProps): React.ReactElement {
  const [tutorialDraft, setTutorialDraft] = useState(course.tutorialWindow ?? '');
  const [isSavingTutorial, setIsSavingTutorial] = useState(false);

  useEffect(() => {
    setTutorialDraft(course.tutorialWindow ?? '');
  }, [course.tutorialWindow, course.courseExternalId]);

  const saveTutorial = async (): Promise<void> => {
    setIsSavingTutorial(true);
    try {
      await apiClient.updateCourseTutorial(
        studentId,
        course.courseExternalId,
        tutorialDraft.trim()
      );
      const grades = await apiClient.getStudentGrades(studentId);
      const updated = grades.courseGrades.find(
        (c) => c.courseExternalId === course.courseExternalId
      );
      if (updated) onCourseUpdated(updated);
    } finally {
      setIsSavingTutorial(false);
    }
  };

  const resetTutorial = async (): Promise<void> => {
    setIsSavingTutorial(true);
    try {
      await apiClient.resetCourseTutorial(studentId, course.courseExternalId);
      const grades = await apiClient.getStudentGrades(studentId);
      const updated = grades.courseGrades.find(
        (c) => c.courseExternalId === course.courseExternalId
      );
      if (updated) onCourseUpdated(updated);
    } finally {
      setIsSavingTutorial(false);
    }
  };

  const sections = buildCourseDetailSections(course);
  const rollup = buildCategoryRollup(course.assignments);
  const isRiskVisible =
    course.riskLevel === 'medium' || course.riskLevel === 'high' || course.riskLevel === 'critical';
  const heroValue =
    course.letterGrade ??
    (course.officialGrade != null ? `${course.officialGrade.toFixed(1)}%` : 'N/A');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {course.courseName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <SectionList<ICourseGradeAssignment, ICourseDetailSection>
        sections={sections}
        keyExtractor={(item) => rowKey(sectionKindFor(item.status), item.externalId)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.heroCard}>
              <Text style={styles.heroValue}>{heroValue}</Text>
              <Text style={styles.heroSub}>
                {`${course.gradedAssignments}/${course.totalAssignments} graded · ${course.missingAssignments} missing · ${course.lateAssignments} late`}
              </Text>
              {isRiskVisible && (
                <Text
                  style={[
                    styles.riskLine,
                    course.riskLevel === 'medium' ? styles.riskMedium : styles.riskHigh,
                  ]}
                >
                  {`${riskLabel(course.riskLevel)} risk${
                    course.riskExplanation ? ` — ${course.riskExplanation}` : ''
                  }`}
                </Text>
              )}
            </View>
            {rollup.length > 0 ? (
              <View style={styles.rollupCard}>
                {rollup.map((entry) => (
                  <View key={entry.category} style={styles.rollupRow}>
                    <View style={styles.rollupLeft}>
                      <Text style={styles.rollupName}>{entry.category}</Text>
                      {entry.weight != null && (
                        <Text style={styles.rollupWeight}>{`${entry.weight}% of grade`}</Text>
                      )}
                    </View>
                    <View style={styles.rollupRight}>
                      <Text style={styles.rollupPoints}>
                        {formatPoints(entry.pointsEarned, entry.pointsPossible)}
                      </Text>
                      {entry.percent != null && (
                        <Text style={styles.rollupPercent}>{`${entry.percent.toFixed(1)}%`}</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            ) : course.totalPointsPossible > 0 ? (
              <View style={styles.rollupCard}>
                <Text style={styles.totalLine}>
                  {`Total points: ${course.totalPointsEarned}/${course.totalPointsPossible}`}
                </Text>
              </View>
            ) : null}
            <View style={styles.scheduleCard} testID="card-course-schedule">
              {course.classMeetingSummary ? (
                <Text style={styles.scheduleLine} testID="text-class-meeting">
                  Class: {course.classMeetingSummary}
                </Text>
              ) : null}
              <Text style={styles.scheduleLabel}>Tutorial window</Text>
              <TextInput
                testID="input-tutorial-window"
                style={styles.tutorialInput}
                value={tutorialDraft}
                onChangeText={setTutorialDraft}
              />
              <View style={styles.tutorialActions}>
                <Button
                  title={isSavingTutorial ? 'Saving…' : 'Save tutorial'}
                  testID="btn-save-tutorial"
                  disabled={isSavingTutorial || tutorialDraft.trim().length === 0}
                  onPress={() => {
                    void saveTutorial();
                  }}
                />
                {course.canResetTutorial ? (
                  <Button
                    title="Reset to synced"
                    testID="btn-reset-tutorial"
                    disabled={isSavingTutorial}
                    onPress={() => {
                      void resetTutorial();
                    }}
                  />
                ) : null}
              </View>
            </View>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={[
              styles.sectionHeader,
              section.kind === 'missing' && styles.sectionHeaderMissing,
            ]}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => {
          const points = formatPoints(item.pointsEarned, item.pointsPossible);
          return (
            <TouchableOpacity style={styles.card} onPress={() => onOpenAssignment(item)}>
              <View style={styles.cardRow}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={[styles.statusBadge, statusColor(item.status)]}>{item.status}</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
              {(item.dueAt != null || points != null) && (
                <Text style={styles.cardSub}>
                  {item.dueAt != null ? `Due: ${formatDate(item.dueAt)}` : ''}
                  {item.dueAt != null && points != null ? '  ·  ' : ''}
                  {points ?? ''}
                </Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.card}>
            <Text style={styles.emptyText}>
              This grade comes from the report-card snapshot — no assignment detail was synced.
            </Text>
          </View>
        }
      />
    </View>
  );
}

function riskLabel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
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
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a2e',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  headerSpacer: { width: 60 },
  listContent: { paddingBottom: 24 },
  heroCard: {
    backgroundColor: '#4361ee',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
  },
  heroValue: { color: '#fff', fontSize: 34, fontWeight: '700' },
  heroSub: { color: '#dbe2ff', fontSize: 13, marginTop: 4 },
  riskLine: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  // Lightened orange/red so the risk text stays readable on the blue hero.
  riskMedium: { color: '#ffc078' },
  riskHigh: { color: '#ffa8a8' },
  rollupCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  rollupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  rollupLeft: { flex: 1, marginRight: 8 },
  rollupName: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  rollupWeight: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  rollupRight: { alignItems: 'flex-end' },
  rollupPoints: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  rollupPercent: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  totalLine: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  scheduleCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 12,
    padding: 14,
  },
  scheduleLine: { fontSize: 14, color: '#495057', marginBottom: 8 },
  scheduleLabel: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  tutorialInput: {
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  tutorialActions: { gap: 8 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    textTransform: 'uppercase',
  },
  sectionHeaderMissing: { color: '#dc3545' },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#1a1a2e', marginRight: 8 },
  cardSub: { fontSize: 13, color: '#6c757d', marginTop: 3 },
  statusBadge: { fontSize: 12, fontWeight: '600' },
  chevron: { color: '#adb5bd', fontSize: 22, marginLeft: 8 },
  emptyText: { fontSize: 14, color: '#6c757d', lineHeight: 20 },
});
