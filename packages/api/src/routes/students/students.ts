import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import {
  StudentRepository,
  IngestSourceRepository,
  IngestRunRepository,
  AlertRepository,
  type IDataSource,
  type IStudentData,
} from '@scholaracle/database';
import { GradeRiskService } from '@scholaracle/agents';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { addSourceSchema, updateSourceSchema } from './schemas';

export interface IStudentsRouterConfig {
  readonly database: Db;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

function percentToLetter(pct: number): string {
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 63) return 'D';
  if (pct >= 60) return 'D-';
  return 'F';
}

function trendFromScores(
  recentPossible: number,
  recentEarned: number,
  olderPossible: number,
  olderEarned: number
): 'improving' | 'stable' | 'declining' {
  if (recentPossible <= 0 || olderPossible <= 0) return 'stable';
  const recentPct = (recentEarned / recentPossible) * 100;
  const olderPct = (olderEarned / olderPossible) * 100;
  const diff = recentPct - olderPct;
  if (diff >= 5) return 'improving';
  if (diff <= -5) return 'declining';
  return 'stable';
}

function riskFromGradeAndMissing(
  grade: number,
  missingCount: number,
  totalAssignments: number
): { level: 'none' | 'low' | 'medium' | 'high' | 'critical'; explanation?: string } {
  const missingRatio = totalAssignments > 0 ? missingCount / totalAssignments : 0;
  if (grade < 60) return { level: 'critical', explanation: 'Grade below 60%' };
  if (grade < 70 || missingRatio > 0.2)
    return {
      level: 'high',
      explanation: missingRatio > 0.2 ? 'Multiple missing assignments' : 'Grade in D range',
    };
  if (grade < 80 || missingRatio > 0.1)
    return {
      level: 'medium',
      explanation: missingRatio > 0.1 ? 'Some missing work' : 'Grade in C range',
    };
  if (missingCount > 0) return { level: 'low', explanation: 'At least one missing assignment' };
  return { level: 'none' };
}

/**
 * Create students router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
export function studentsRouter(config: IStudentsRouterConfig): Router {
  const router = Router();
  const studentRepository = new StudentRepository(config.database);
  const ingestSourceRepository = new IngestSourceRepository(config.database);
  const ingestRunRepository = new IngestRunRepository(config.database);
  const alertRepository = new AlertRepository(config.database);

  /**
   * GET /api/students
   * Get all students for the authenticated user.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const students = await studentRepository.findByUserId(userId);

      res.status(200).json(
        students.map((student) => ({
          id: student._id?.toString() ?? '',
          userId: student.userId.toString(),
          name: student.name,
          grade: student.grade,
          studentId: student.studentId,
          stats: student.stats,
        }))
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/students/:id
   * Get student by ID.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'Missing student ID' });
        return;
      }
      const student = await studentRepository.findById(id);
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      if (student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      res.status(200).json({
        id: student._id?.toString(),
        userId: student.userId.toString(),
        name: student.name,
        grade: student.grade,
        studentId: student.studentId,
        stats: student.stats,
        dataSources: student.dataSources,
        alertPreferences: student.alertPreferences,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/students/:id/grades
   * Get per-course grades and assignment breakdown for a student.
   */
  router.get('/:id/grades', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: studentDbId } = req.params;
      if (!studentDbId) {
        res.status(400).json({ success: false, error: 'Missing student ID' });
        return;
      }
      const student = await studentRepository.findById(studentDbId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const studentExternalId = student.studentId ?? '';
      const assignmentsColl = config.database.collection('slc_assignments');
      const coursesColl = config.database.collection('slc_courses');

      const assignmentDocs = await assignmentsColl
        .find({
          userId,
          studentExternalId,
          deletedAt: null,
        })
        .toArray();

      const courseIds = [
        ...new Set(
          assignmentDocs.map((d) => d['courseExternalId'] as string).filter(Boolean) as string[]
        ),
      ];
      const courseMap = new Map<string, string>();
      if (courseIds.length > 0) {
        const courseDocs = await coursesColl
          .find({ userId, externalId: { $in: courseIds } })
          .toArray();
        for (const c of courseDocs) {
          const extId = c['externalId'] as string;
          const name = c['record']?.name as string | undefined;
          if (extId && name) courseMap.set(extId, name);
        }
      }

      type AssignmentStatus = 'missing' | 'submitted' | 'graded' | 'late' | 'unknown';
      const courseData = new Map<
        string,
        {
          totalPointsPossible: number;
          totalPointsEarned: number;
          gradedCount: number;
          missingCount: number;
          lateCount: number;
          assignments: Array<{
            externalId: string;
            title: string;
            dueAt?: string;
            status: AssignmentStatus;
            pointsPossible?: number;
            pointsEarned?: number;
            isOverdue: boolean;
            weight?: number;
          }>;
          recentPointsPossible: number;
          recentPointsEarned: number;
          olderPointsPossible: number;
          olderPointsEarned: number;
        }
      >();

      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

      for (const doc of assignmentDocs) {
        const courseExternalId = (doc['courseExternalId'] as string) ?? '_unknown';
        const record = doc['record'] as Record<string, unknown> | undefined;
        const dueAt = record?.['dueAt'] as string | undefined;
        const status = (record?.['status'] as AssignmentStatus) ?? 'unknown';
        const pointsPossible =
          typeof record?.['pointsPossible'] === 'number' ? record!['pointsPossible'] : undefined;
        const pointsEarned =
          typeof record?.['pointsEarned'] === 'number' ? record!['pointsEarned'] : undefined;
        const title = (record?.['title'] as string) ?? 'Assignment';
        const externalId = (doc['externalId'] as string) ?? '';

        if (!courseData.has(courseExternalId)) {
          courseData.set(courseExternalId, {
            totalPointsPossible: 0,
            totalPointsEarned: 0,
            gradedCount: 0,
            missingCount: 0,
            lateCount: 0,
            assignments: [],
            recentPointsPossible: 0,
            recentPointsEarned: 0,
            olderPointsPossible: 0,
            olderPointsEarned: 0,
          });
        }
        const data = courseData.get(courseExternalId)!;
        const isOverdue = dueAt ? new Date(dueAt).getTime() < now.getTime() : false;

        data.assignments.push({
          externalId,
          title,
          dueAt,
          status,
          pointsPossible,
          pointsEarned,
          isOverdue,
        });

        if (status === 'graded' && pointsPossible != null && pointsPossible > 0) {
          data.totalPointsPossible += pointsPossible;
          data.totalPointsEarned += pointsEarned ?? 0;
          data.gradedCount += 1;
          const dueTime = dueAt ? new Date(dueAt).getTime() : 0;
          if (dueTime >= twoWeeksAgo.getTime()) {
            data.recentPointsPossible += pointsPossible;
            data.recentPointsEarned += pointsEarned ?? 0;
          } else if (dueTime >= fourWeeksAgo.getTime()) {
            data.olderPointsPossible += pointsPossible;
            data.olderPointsEarned += pointsEarned ?? 0;
          }
        }
        if (status === 'missing') data.missingCount += 1;
        if (status === 'late') data.lateCount += 1;
      }

      const courseGrades: Array<{
        courseExternalId: string;
        courseName: string;
        grade: number;
        letterGrade: string;
        totalAssignments: number;
        gradedAssignments: number;
        missingAssignments: number;
        lateAssignments: number;
        totalPointsPossible: number;
        totalPointsEarned: number;
        recentTrend: 'improving' | 'stable' | 'declining';
        riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
        riskExplanation?: string;
        assignments: Array<{
          externalId: string;
          title: string;
          dueAt?: string;
          status: AssignmentStatus;
          pointsPossible?: number;
          pointsEarned?: number;
          isOverdue: boolean;
          weight?: number;
        }>;
      }> = [];

      for (const [courseExternalId, data] of courseData) {
        const totalAssignments = data.assignments.length;
        const grade =
          data.totalPointsPossible > 0
            ? Math.round((data.totalPointsEarned / data.totalPointsPossible) * 1000) / 10
            : 0;
        const letterGrade = percentToLetter(grade);
        const trend = trendFromScores(
          data.recentPointsPossible,
          data.recentPointsEarned,
          data.olderPointsPossible,
          data.olderPointsEarned
        );
        const { level: riskLevel, explanation: riskExplanation } = riskFromGradeAndMissing(
          grade,
          data.missingCount,
          totalAssignments
        );

        courseGrades.push({
          courseExternalId,
          courseName: courseMap.get(courseExternalId) ?? courseExternalId,
          grade,
          letterGrade,
          totalAssignments,
          gradedAssignments: data.gradedCount,
          missingAssignments: data.missingCount,
          lateAssignments: data.lateCount,
          totalPointsPossible: data.totalPointsPossible,
          totalPointsEarned: data.totalPointsEarned,
          recentTrend: trend,
          riskLevel,
          riskExplanation,
          assignments: data.assignments.sort((a, b) => {
            const ta = a.dueAt ? new Date(a.dueAt).getTime() : 0;
            const tb = b.dueAt ? new Date(b.dueAt).getTime() : 0;
            return tb - ta;
          }),
        });
      }

      const overallGPA =
        student.stats?.currentGPA ??
        (courseGrades.length > 0
          ? courseGrades.reduce((s, c) => s + c.grade, 0) / courseGrades.length
          : 0);
      const atRiskCourses = courseGrades.filter((c) =>
        ['medium', 'high', 'critical'].includes(c.riskLevel)
      ).length;

      let aiOverview: string | undefined;
      const gradeRiskService = new GradeRiskService({
        apiKey: process.env['ANTHROPIC_API_KEY'],
        cacheTtlMs: 5 * 60 * 1000,
      });
      if (gradeRiskService.isAvailable() && courseGrades.length > 0) {
        const input = courseGrades.map((c) => ({
          courseExternalId: c.courseExternalId,
          courseName: c.courseName,
          grade: c.grade,
          letterGrade: c.letterGrade,
          totalAssignments: c.totalAssignments,
          gradedAssignments: c.gradedAssignments,
          missingAssignments: c.missingAssignments,
          lateAssignments: c.lateAssignments,
          recentTrend: c.recentTrend,
          riskLevel: c.riskLevel,
          riskExplanation: c.riskExplanation,
        }));
        const riskResult = await gradeRiskService.analyze(student.name, input, overallGPA);
        aiOverview = riskResult.aiOverview;
        for (const c of courseGrades) {
          const enh = riskResult.courseEnhancements.get(c.courseExternalId);
          if (enh) {
            c.riskLevel = enh.riskLevel;
            if (enh.riskExplanation != null) c.riskExplanation = enh.riskExplanation;
          }
        }
      }

      res.status(200).json({
        studentId: studentDbId,
        studentName: student.name,
        overallGPA: Math.round(overallGPA * 10) / 10,
        courseGrades,
        atRiskCourses,
        aiOverview,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students
   * Create a new student.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const { name, grade, studentId } = req.body as {
        name?: string;
        grade?: number;
        studentId?: string;
      };

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: name',
        });
        return;
      }

      const student = await studentRepository.create({
        userId: new ObjectId(userId),
        name,
        grade,
        studentId,
      });

      res.status(201).json({
        id: student._id?.toString() ?? '',
        userId: student.userId.toString(),
        name: student.name,
        grade: student.grade,
        studentId: student.studentId,
        stats: student.stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/students/:id
   * Update student.
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'Missing student ID' });
        return;
      }
      const existing = await studentRepository.findById(id);
      if (!existing || existing.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const updates = req.body as Partial<IStudentData>;

      const student = await studentRepository.update(id, updates);
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      res.status(200).json({
        id: student._id?.toString(),
        userId: student.userId.toString(),
        name: student.name,
        grade: student.grade,
        studentId: student.studentId,
        stats: student.stats,
        dataSources: student.dataSources,
        alertPreferences: student.alertPreferences,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/students/:id
   * Delete student.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ success: false, error: 'Missing student ID' });
        return;
      }
      const student = await studentRepository.findById(id);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      const deleted = await studentRepository.delete(id);
      if (!deleted) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // --- Student data sources (must be before /:id to avoid matching "sources" as id) ---

  /**
   * GET /api/students/:id/sources
   * List data sources for a student.
   */
  router.get('/:id/sources', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: studentId } = req.params;
      if (!studentId) {
        res.status(400).json({ success: false, error: 'Missing student ID' });
        return;
      }
      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const sources: Array<{
        id: string;
        pluginId: string;
        provider: string;
        displayName: string;
        portalBaseUrl?: string;
        enabled: boolean;
        schedule: string;
        dataTypes: string[];
        status: string;
        lastScraped?: string;
        lastSuccess?: string;
        lastError?: string | null;
      }> = [];

      for (const ds of student.dataSources) {
        const ingestSource = await ingestSourceRepository.findByUserIdAndSourceId(userId, ds.id);
        if (!ingestSource) continue;
        sources.push({
          id: ds.id,
          pluginId: ds.pluginId,
          provider: ingestSource.provider,
          displayName: ingestSource.displayName,
          portalBaseUrl: ingestSource.portalBaseUrl,
          enabled: ds.enabled,
          schedule: ds.schedule ?? 'every_6h',
          dataTypes: ds.dataTypes ? [...ds.dataTypes] : [],
          status: ds.status ?? 'active',
          lastScraped: ds.lastScraped?.toISOString(),
          lastSuccess: ds.lastSuccess?.toISOString(),
          lastError: ds.lastError ?? null,
        });
      }

      res.status(200).json(sources);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students/:id/sources
   * Add a data source to a student.
   */
  router.post('/:id/sources', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: studentId } = req.params;
      if (!studentId) {
        res.status(400).json({ success: false, error: 'Missing student ID' });
        return;
      }
      const parsed = addSourceSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((e: { message: string }) => e.message).join('; ');
        res.status(400).json({ success: false, error: msg });
        return;
      }
      const body = parsed.data;

      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const sourceId = randomUUID();
      await ingestSourceRepository.upsert({
        userId,
        sourceId,
        provider: body.provider,
        adapterId: body.adapterId,
        displayName: body.displayName,
        portalBaseUrl: body.portalBaseUrl || undefined,
      });

      const newDataSource: IDataSource = {
        id: sourceId,
        pluginId: body.adapterId,
        enabled: true,
        schedule: body.schedule,
        dataTypes: [...body.dataTypes],
        status: 'active',
      };
      const updatedDataSources = [...student.dataSources, newDataSource];
      const updated = await studentRepository.update(studentId, {
        dataSources: updatedDataSources,
      });
      if (!updated) {
        res.status(500).json({ success: false, error: 'Failed to update student' });
        return;
      }

      const ingestSource = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      res.status(201).json({
        id: sourceId,
        pluginId: body.adapterId,
        provider: body.provider,
        displayName: body.displayName,
        portalBaseUrl: ingestSource?.portalBaseUrl,
        enabled: true,
        schedule: body.schedule,
        dataTypes: body.dataTypes,
        status: 'active',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/students/:id/sources/:sourceId
   * Update a data source config for a student.
   */
  router.put('/:id/sources/:sourceId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: studentId, sourceId } = req.params;
      if (!studentId || !sourceId) {
        res.status(400).json({ success: false, error: 'Missing student ID or source ID' });
        return;
      }
      const parsed = updateSourceSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((e: { message: string }) => e.message).join('; ');
        res.status(400).json({ success: false, error: msg });
        return;
      }
      const updates = parsed.data;

      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const idx = student.dataSources.findIndex((ds) => ds.id === sourceId);
      if (idx === -1) {
        res.status(404).json({ success: false, error: 'Source not found' });
        return;
      }

      const ds = student.dataSources[idx]!;
      const existingIngest = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);

      if (updates.displayName !== undefined || updates.portalBaseUrl !== undefined) {
        await ingestSourceRepository.upsert({
          userId,
          sourceId,
          provider: existingIngest?.provider ?? '',
          adapterId: ds.pluginId,
          displayName: updates.displayName ?? existingIngest?.displayName ?? '',
          portalBaseUrl: updates.portalBaseUrl ?? existingIngest?.portalBaseUrl,
        });
      }

      const dataSourcesUpdated = student.dataSources.map((d) =>
        d.id === sourceId
          ? {
              ...d,
              schedule: updates.schedule ?? d.schedule,
              dataTypes: updates.dataTypes ?? d.dataTypes,
              enabled: updates.enabled ?? d.enabled,
            }
          : d
      );
      await studentRepository.update(studentId, { dataSources: dataSourcesUpdated });

      const ingestSource = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      const updatedDs = dataSourcesUpdated[idx]!;
      res.status(200).json({
        id: sourceId,
        pluginId: ds.pluginId,
        provider: ingestSource?.provider ?? '',
        displayName: ingestSource?.displayName ?? '',
        portalBaseUrl: ingestSource?.portalBaseUrl,
        enabled: updatedDs.enabled ?? ds.enabled,
        schedule: updatedDs.schedule ?? ds.schedule,
        dataTypes: updatedDs.dataTypes ?? ds.dataTypes ?? [],
        status: ds.status ?? 'active',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/students/:id/sources/:sourceId
   * Remove a data source from a student.
   */
  router.delete('/:id/sources/:sourceId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: studentId, sourceId } = req.params;
      if (!studentId || !sourceId) {
        res.status(400).json({ success: false, error: 'Missing student ID or source ID' });
        return;
      }

      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const newDataSources = student.dataSources.filter((ds) => ds.id !== sourceId);
      if (newDataSources.length === student.dataSources.length) {
        res.status(404).json({ success: false, error: 'Source not found' });
        return;
      }

      await studentRepository.update(studentId, { dataSources: [...newDataSources] });
      await ingestSourceRepository.deleteByUserIdAndSourceId(userId, sourceId);

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/students/:id/sources/:sourceId/runs
   * List ingest runs for a source.
   */
  router.get('/:id/sources/:sourceId/runs', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: studentId, sourceId } = req.params;
      if (!studentId || !sourceId) {
        res.status(400).json({ success: false, error: 'Missing student ID or source ID' });
        return;
      }

      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      const hasSource = student.dataSources.some((ds) => ds.id === sourceId);
      if (!hasSource) {
        res.status(404).json({ success: false, error: 'Source not found' });
        return;
      }

      const limitParam = req.query['limit'];
      const limit = typeof limitParam === 'string' ? parseInt(limitParam, 10) : 50;
      const runs = await ingestRunRepository.listByUserIdAndSourceId(userId, sourceId, limit);

      res.status(200).json(
        runs.map(
          (r: {
            runId: string;
            status: string;
            startedAt: Date;
            uploadedAt?: Date;
            committedAt?: Date;
            error?: string | null;
          }) => ({
            runId: r.runId,
            status: r.status,
            startedAt: r.startedAt.toISOString(),
            uploadedAt: r.uploadedAt?.toISOString(),
            committedAt: r.committedAt?.toISOString(),
            error: r.error ?? null,
          })
        )
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/students/:id/alerts
   * List alerts for a student.
   */
  router.get('/:id/alerts', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: studentId } = req.params;
      if (!studentId) {
        res.status(400).json({ success: false, error: 'Missing student ID' });
        return;
      }

      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const allAlerts = await alertRepository.findByUserId(userId);
      const alerts = allAlerts.filter((a) => a.studentId === studentId);

      res.status(200).json(
        alerts.map((a) => ({
          id: (a as { id?: string }).id ?? '',
          studentId: a.studentId,
          type: a.type,
          severity: a.severity,
          message: a.message,
          acknowledged: a.acknowledged ?? false,
          acknowledgedAt: a.acknowledgedAt?.toISOString(),
          createdAt: a.createdAt?.toISOString?.() ?? new Date().toISOString(),
        }))
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students/:id/sources/:sourceId/runs/trigger
   * Trigger a manual sync (creates a new ingest run).
   */
  router.post('/:id/sources/:sourceId/runs/trigger', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: studentId, sourceId } = req.params;
      if (!studentId || !sourceId) {
        res.status(400).json({ success: false, error: 'Missing student ID or source ID' });
        return;
      }

      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      const hasSource = student.dataSources.some((ds) => ds.id === sourceId);
      if (!hasSource) {
        res.status(404).json({ success: false, error: 'Source not found' });
        return;
      }

      const lastCursor = await ingestRunRepository.findLastCommittedCursor(userId, sourceId);
      const runId = randomUUID();
      const run = await ingestRunRepository.startRun({ userId, sourceId, runId, lastCursor });

      res.status(201).json({
        runId: run.runId,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        uploadedAt: run.uploadedAt?.toISOString(),
        committedAt: run.committedAt?.toISOString(),
        error: run.error ?? null,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
