/**
 * AssignmentDetailScreen — one assignment's facts, rubric, attachments, and
 * synced course resources.
 *
 * Resources are fetched on every mount and NEVER cached: the response carries
 * signed download URLs with a 24h TTL, so a stored copy goes stale.
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import type {
  ICourseGradeAssignment,
  ICourseMaterial,
  IStudentMaterialsResponse,
} from '@scholaracle/contracts';
import { apiClient } from '../api/client';
import { ApiError } from '../api/ApiError';
import { formatDate, formatPercent, formatPoints, statusColor } from '../grades/format';
import {
  classifyResource,
  partitionMaterials,
  type IResourceLink,
} from '../resources/resourcePartition';

interface IAssignmentDetailScreenProps {
  /** Mongo `id` from GET /api/students — used for the materials call. */
  readonly studentId: string;
  readonly courseName: string;
  readonly assignment: ICourseGradeAssignment;
  onBack(): void;
}

export function AssignmentDetailScreen({
  studentId,
  courseName,
  assignment,
  onBack,
}: IAssignmentDetailScreenProps): React.ReactElement {
  const [materials, setMaterials] = useState<IStudentMaterialsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const assignmentExternalId = assignment.externalId;
  const loadMaterials = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setMaterials(await apiClient.getAssignmentMaterials(studentId, assignmentExternalId));
    } catch (err: unknown) {
      const message =
        err instanceof ApiError && err.requestId
          ? `${err.message} (ref: ${err.requestId})`
          : err instanceof Error
            ? err.message
            : 'Failed to load resources';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [studentId, assignmentExternalId]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  const handleOpenLink = async (href: string): Promise<void> => {
    try {
      await openURL(href);
    } catch {
      Alert.alert('Could not open link');
    }
  };
  const openLink = (href: string): void => {
    void handleOpenLink(href);
  };

  const points = formatPoints(assignment.pointsEarned, assignment.pointsPossible);
  const percent = formatPercent(assignment.pointsEarned, assignment.pointsPossible);
  const hasFacts = assignment.dueAt != null || points != null || assignment.category != null;
  const partition = materials != null ? partitionMaterials(materials, assignmentExternalId) : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Assignment</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionCard}>
          <View style={styles.cardRow}>
            <Text style={styles.assignmentTitle}>{assignment.title}</Text>
            <Text style={[styles.statusBadge, statusColor(assignment.status)]}>
              {assignment.status}
            </Text>
          </View>
          <Text style={styles.courseName}>{courseName}</Text>
        </View>

        {hasFacts && (
          <View style={styles.sectionCard}>
            {assignment.dueAt != null && (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Due</Text>
                <Text style={styles.factValue}>
                  {formatDate(assignment.dueAt)}
                  {assignment.isOverdue && <Text style={styles.overdue}>{'  ·  Overdue'}</Text>}
                </Text>
              </View>
            )}
            {points != null && (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Points</Text>
                <Text style={styles.factValue}>
                  {percent != null ? `${points}  ·  ${percent}` : points}
                </Text>
              </View>
            )}
            {assignment.category != null && (
              <View style={styles.factRow}>
                <Text style={styles.factLabel}>Category</Text>
                <Text style={styles.factValue}>
                  {assignment.categoryWeight != null
                    ? `${assignment.category} · ${assignment.categoryWeight}% of grade`
                    : assignment.category}
                </Text>
              </View>
            )}
          </View>
        )}

        {assignment.rubricScores != null && assignment.rubricScores.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.cardHeader}>Rubric</Text>
            {assignment.rubricScores.map((score, index) => {
              const rubricPoints = formatPoints(score.score, score.possiblePoints);
              return (
                <View key={`${score.criterion}:${index}`} style={styles.rubricRow}>
                  <View style={styles.cardRow}>
                    <Text style={styles.rubricCriterion}>{score.criterion}</Text>
                    {rubricPoints != null && (
                      <Text style={styles.rubricPoints}>{rubricPoints}</Text>
                    )}
                  </View>
                  {score.rating != null && <Text style={styles.rubricRating}>{score.rating}</Text>}
                  {score.comments != null && (
                    <Text style={styles.rubricComments}>{score.comments}</Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {assignment.attachments != null && assignment.attachments.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.cardHeader}>Attachments</Text>
            {assignment.attachments.map((attachment, index) => (
              <ResourceRow
                key={`${attachment.name}:${index}`}
                title={attachment.name}
                subtitle={attachment.type}
                link={classifyResource(attachment, apiClient.baseUrlValue)}
                onOpen={openLink}
              />
            ))}
          </View>
        )}

        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#4361ee" />
          </View>
        )}

        {error != null && !isLoading && (
          <View style={styles.errorBox}>
            <Text style={styles.error} numberOfLines={2}>
              {error}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void loadMaterials()}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {partition != null && !isLoading && error == null && (
          <>
            {partition.forAssignment.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.cardHeader}>For this assignment</Text>
                {partition.forAssignment.map((material) => (
                  <MaterialRow key={material.externalId} material={material} onOpen={openLink} />
                ))}
              </View>
            )}
            {partition.courseMaterials.length > 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.cardHeader}>Course materials</Text>
                {partition.courseMaterials.map((material) => (
                  <MaterialRow key={material.externalId} material={material} onOpen={openLink} />
                ))}
              </View>
            )}
            {partition.forAssignment.length === 0 && partition.courseMaterials.length === 0 && (
              <View style={styles.sectionCard}>
                <Text style={styles.emptyText}>
                  No resources synced for this course yet. Run a sync to pull the latest materials.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface IMaterialRowProps {
  readonly material: ICourseMaterial;
  onOpen(href: string): void;
}

function MaterialRow({ material, onOpen }: IMaterialRowProps): React.ReactElement {
  const subParts = [material.fileName ?? material.type];
  if (material.postedAt != null) subParts.push(formatDate(material.postedAt));
  return (
    <ResourceRow
      title={material.title}
      subtitle={subParts.join('  ·  ')}
      link={classifyResource(material, apiClient.baseUrlValue)}
      isAuthRequired={material.linkAccessibility === 'authenticated'}
      onOpen={onOpen}
    />
  );
}

interface IResourceRowProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly link: IResourceLink;
  readonly isAuthRequired?: boolean;
  onOpen(href: string): void;
}

function ResourceRow({
  title,
  subtitle,
  link,
  isAuthRequired = false,
  onOpen,
}: IResourceRowProps): React.ReactElement {
  const href = link.href;
  const isTappable = href != null;
  return (
    <TouchableOpacity
      style={[styles.resourceRow, link.kind === 'own-unsigned' && styles.resourceRowDisabled]}
      disabled={!isTappable}
      onPress={() => {
        if (href != null) onOpen(href);
      }}
    >
      <View style={styles.resourceInfo}>
        <Text
          style={[
            styles.resourceTitle,
            link.kind === 'own-unsigned' && styles.resourceTitleDisabled,
          ]}
        >
          {title}
        </Text>
        {subtitle != null && subtitle !== '' && <Text style={styles.resourceSub}>{subtitle}</Text>}
        {link.kind === 'portal' && <Text style={styles.resourceHint}>Opens school portal</Text>}
        {link.kind === 'own-unsigned' && (
          <Text style={styles.resourceHint}>Update the app/server to open this file</Text>
        )}
        {isAuthRequired && <Text style={styles.resourceHint}>Requires school login</Text>}
      </View>
      {isTappable && <Text style={styles.resourceArrow}>↗</Text>}
    </TouchableOpacity>
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
  headerSpacer: { width: 60 },
  scrollContent: { paddingBottom: 32 },
  sectionCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  assignmentTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#1a1a2e', marginRight: 8 },
  statusBadge: { fontSize: 12, fontWeight: '600' },
  courseName: { fontSize: 13, color: '#6c757d', marginTop: 4 },
  cardHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6c757d',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  factRow: { flexDirection: 'row', paddingVertical: 6 },
  factLabel: { width: 84, fontSize: 14, color: '#6c757d' },
  factValue: { flex: 1, fontSize: 14, fontWeight: '500', color: '#1a1a2e' },
  overdue: { color: '#dc3545', fontWeight: '700' },
  rubricRow: { paddingVertical: 6 },
  rubricCriterion: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1a1a2e', marginRight: 8 },
  rubricPoints: { fontSize: 14, fontWeight: '600', color: '#4361ee' },
  rubricRating: { fontSize: 13, color: '#1a1a2e', marginTop: 2 },
  rubricComments: { fontSize: 13, color: '#6c757d', marginTop: 2 },
  resourceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  resourceRowDisabled: { opacity: 0.55 },
  resourceInfo: { flex: 1, marginRight: 8 },
  resourceTitle: { fontSize: 14, fontWeight: '600', color: '#1a1a2e' },
  resourceTitleDisabled: { color: '#6c757d' },
  resourceSub: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  resourceHint: { fontSize: 12, color: '#6c757d', fontStyle: 'italic', marginTop: 2 },
  resourceArrow: { fontSize: 16, color: '#4361ee' },
  loadingRow: { paddingVertical: 16, alignItems: 'center' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderColor: '#f5c2c7',
    borderWidth: 1,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    gap: 12,
  },
  error: { color: '#dc3545', flex: 1 },
  retryButton: {
    backgroundColor: '#4361ee',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyText: { fontSize: 14, color: '#6c757d', lineHeight: 20 },
});
