import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ObjectId, type Db } from 'mongodb';
import {
  StudentRepository,
  IngestSourceRepository,
  IngestRunRepository,
  AlertRepository,
  SubscriptionRepository,
  PLAN_FEATURES,
  type IDataSource,
  type IDataSourceCredentials,
  type ISharedParent,
  type IStudentData,
} from '@scholaracle/database';
import { GradeRiskService } from '@scholaracle/agents';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import type { IInviteEmailSender } from '../../services/InviteEmailSender';
import { createHash } from 'node:crypto';
import { encryptCredentials } from '../../utils/credentialsCipher';
import { addSourceSchema, updateSourceSchema, credentialsSchema } from './schemas';
import { validateGradeHistoryQuery } from './gradeHistoryQueryValidator';

// ---------------------------------------------------------------------------
// Lightweight cross-source course reconciliation (inline to avoid connector dep)
// ---------------------------------------------------------------------------

interface ISourceCourse {
  readonly externalId: string;
  readonly sourceId: string;
  readonly provider: string;
  readonly title: string;
  readonly teacherName?: string;
  readonly period?: string;
  readonly grade?: number;
}

interface IMergedCourse {
  readonly mergedId: string;
  readonly normalizedTitle: string;
  readonly sources: readonly ISourceCourse[];
}

function normalizeTitle(raw: string): string {
  return raw
    .replace(/\bap\b|advanced\s+placement/gi, '')
    .replace(/\bhonors?\b|\bhn?rs?\b/gi, '')
    .replace(/(?:per(?:iod)?|pd?)[\s.:]*\d+/gi, '')
    .replace(/\([^)]*\)\s*$/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function mergeCoursesInline(courses: readonly ISourceCourse[]): readonly IMergedCourse[] {
  const groups = new Map<string, ISourceCourse[]>();
  for (const c of courses) {
    const key = normalizeTitle(c.title);
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }
  const result: IMergedCourse[] = [];
  for (const [key, members] of groups) {
    const mergedId = createHash('sha256').update(key).digest('hex').slice(0, 12);
    const bestTitle = members.reduce(
      (best, m) => (m.title.length > best.length ? m.title : best),
      members[0]!.title
    );
    result.push({
      mergedId,
      normalizedTitle: bestTitle.replace(/\s+/g, ' ').trim(),
      sources: members,
    });
  }
  return result;
}

export interface IStudentsRouterConfig {
  readonly database: Db;
  readonly baseUrl?: string;
  /** Optional sender for contact-invitation emails. */
  readonly sendInviteEmail?: IInviteEmailSender;
}

export interface IActionAsset {
  readonly assetId: string;
  readonly fileName: string;
  readonly materialType: string;
  readonly mimeType: string;
  readonly fileSize: number;
  readonly downloadUrl: string;
}

export interface IActionItem {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly status: string;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly isOverdue: boolean;
  readonly course: {
    readonly externalId: string;
    readonly name: string;
    readonly currentGrade?: number;
    readonly letterGrade?: string;
    readonly riskLevel: string;
  };
  readonly assets: readonly IActionAsset[];
  readonly materials: readonly IActionAsset[];
}

export interface IActionBucket {
  readonly id: 'needs_attention' | 'due_soon' | 'in_progress' | 'recently_graded' | 'caught_up';
  readonly label: string;
  readonly count: number;
  readonly items: readonly IActionItem[];
}

export interface IActionBoardResponse {
  readonly studentId: string;
  readonly studentName: string;
  readonly buckets: readonly IActionBucket[];
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

type ActionBoardAssetDoc = {
  assetId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  entityType?: string;
  record?: Record<string, unknown>;
};

type ActionBoardAssignmentDoc = {
  externalId?: string;
  record?: Record<string, unknown>;
};

type BucketId = 'needs_attention' | 'due_soon' | 'in_progress' | 'recently_graded' | 'caught_up';

function buildActionAsset(doc: ActionBoardAssetDoc, baseUrl: string): IActionAsset {
  const entityType = (doc.entityType ?? '') as string;
  const matRecord = doc.record as Record<string, unknown> | undefined;
  const materialType =
    entityType === 'courseMaterial'
      ? ((matRecord?.['type'] as string) ?? 'document')
      : 'attachment';
  return {
    assetId: (doc.assetId as string) ?? '',
    fileName: (doc.fileName as string) ?? 'file',
    materialType,
    mimeType: (doc.mimeType as string) ?? 'application/octet-stream',
    fileSize: (doc.fileSize as number) ?? 0,
    downloadUrl: baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/assets/${doc.assetId as string}` : '',
  };
}

function determineActionBucket(
  item: IActionItem,
  assignmentDocs: ActionBoardAssignmentDoc[],
  nowMs: number,
  seventyTwoHoursMs: number,
  sevenDaysMs: number
): BucketId {
  const dueAt = item.dueAt ? new Date(item.dueAt).getTime() : null;
  const doc = assignmentDocs.find((d) => d.externalId === item.assignmentExternalId) as
    | ActionBoardAssignmentDoc
    | undefined;
  const docGradedAt = (doc?.record as Record<string, unknown> | undefined)?.['gradedAt'] as
    | string
    | undefined;
  const gradedAtMs = docGradedAt ? new Date(docGradedAt).getTime() : 0;

  if (item.status === 'missing') return 'needs_attention';
  if (item.status === 'late') return 'needs_attention';
  if (item.course.currentGrade != null && item.course.currentGrade < 70) return 'needs_attention';
  if (
    dueAt != null &&
    dueAt - nowMs <= seventyTwoHoursMs &&
    dueAt >= nowMs &&
    item.status !== 'submitted' &&
    item.status !== 'graded'
  )
    return 'due_soon';
  if (item.status === 'graded' && gradedAtMs && nowMs - gradedAtMs <= sevenDaysMs)
    return 'recently_graded';
  if (item.status === 'in_progress' || item.status === 'submitted') return 'in_progress';
  return 'caught_up';
}

/**
 * Create students router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
// eslint-disable-next-line max-lines-per-function, complexity
export function studentsRouter(config: IStudentsRouterConfig): Router {
  const router = Router();
  const studentRepository = new StudentRepository(config.database);
  const ingestSourceRepository = new IngestSourceRepository(config.database);
  const ingestRunRepository = new IngestRunRepository(config.database);
  const alertRepository = new AlertRepository(config.database);
  const subscriptionRepository = new SubscriptionRepository(config.database);

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
   * GET /api/students/invites/pending
   * List all pending invites for the current user (by email).
   * Must be registered BEFORE /:id to avoid matching "invites" as an id.
   */
  router.get('/invites/pending', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { email } = req.query as { email?: string };
      if (!email) {
        res.status(200).json([]);
        return;
      }

      const students = await studentRepository.findPendingInvites(email.toLowerCase().trim());
      const invites = students.map((s) => ({
        studentId: s._id?.toString(),
        studentName: s.name,
        invitedBy: s.userId.toString(),
        invite: s.sharedWith.find(
          (sp) => sp.email === email.toLowerCase().trim() && sp.status === 'pending'
        ),
      }));

      res.status(200).json(invites);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/students/:id/contacts
   * List owner + all contacts with status (consent-first contact list).
   */
  router.get('/:id/contacts', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      const contacts = [
        {
          userId: student.userId.toString(),
          role: 'parent' as const,
          status: 'accepted' as const,
          isOwner: true,
          isAdmin: true,
          receiveAlerts: student.ownerAlertPrefs?.receiveAlerts !== false,
          alertChannels: student.ownerAlertPrefs?.alertChannels ?? ['email'],
          alertTypes: student.ownerAlertPrefs?.alertTypes,
        },
        ...student.sharedWith.map((sp) => ({
          userId: sp.userId,
          email: sp.email,
          name: sp.name,
          phone: sp.phone,
          role: sp.role,
          status: sp.status,
          isAdmin: sp.isAdmin ?? false,
          invitedAt: sp.invitedAt?.toISOString?.(),
          acceptedAt: sp.acceptedAt?.toISOString?.(),
          isOwner: false,
          receiveAlerts: sp.receiveAlerts !== false,
          alertChannels: sp.alertChannels ?? ['email'],
          alertTypes: sp.alertTypes,
        })),
      ];
      res.status(200).json(contacts);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students/:id/contacts
   * Invite a new contact. Sends invitation email when sendInviteEmail is configured.
   */
  router.post('/:id/contacts', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      if (!student.canAdmin(userId)) {
        res.status(403).json({ success: false, error: 'Only an admin can add contacts' });
        return;
      }
      const body = req.body as {
        email?: string;
        name?: string;
        phone?: string;
        role?: string;
        alertChannels?: readonly ('email' | 'sms')[];
        alertTypes?: readonly string[];
      };
      if (!body.email || typeof body.email !== 'string' || !body.email.includes('@')) {
        res.status(400).json({ success: false, error: 'Valid email is required' });
        return;
      }
      const normalizedEmail = body.email.toLowerCase().trim();
      const role =
        body.role === 'guardian' || body.role === 'caregiver' ? body.role : ('parent' as const);
      if (student.hasContact(normalizedEmail)) {
        res.status(409).json({ success: false, error: 'This email is already a contact' });
        return;
      }
      const newContact: ISharedParent = {
        email: normalizedEmail,
        name: body.name?.trim(),
        phone: body.phone?.trim(),
        role,
        status: 'pending',
        invitedAt: new Date(),
        receiveAlerts: true,
        alertChannels: body.alertChannels ?? ['email'],
        alertTypes: body.alertTypes,
      };
      const newShared: readonly ISharedParent[] = [...student.sharedWith, newContact];
      await studentRepository.update(student._id!, { sharedWith: newShared });
      const baseUrl = config.baseUrl ?? process.env['BASE_URL'] ?? 'http://localhost:2800';
      try {
        await config.sendInviteEmail?.sendInvite({
          to: normalizedEmail,
          studentName: student.name,
          studentId: student._id!.toString(),
          inviteEmail: normalizedEmail,
          baseUrl,
        });
      } catch {
        // Log but do not fail the request
      }
      res.status(201).json({
        success: true,
        contact: {
          email: normalizedEmail,
          name: newContact.name,
          phone: newContact.phone,
          role,
          status: 'pending',
          invitedAt: newContact.invitedAt.toISOString(),
          receiveAlerts: true,
          alertChannels: newContact.alertChannels,
          alertTypes: newContact.alertTypes,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students/:id/contacts/accept
   * Accept a pending invite (authenticated user; email must match).
   */
  router.post('/:id/contacts/accept', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { email } = req.body as { email?: string };
      if (!email) {
        res.status(400).json({ success: false, error: 'Email is required' });
        return;
      }
      const normalizedEmail = (email as string).toLowerCase().trim();
      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      const inviteIdx = student.sharedWith.findIndex(
        (sp) => sp.email === normalizedEmail && sp.status === 'pending'
      );
      if (inviteIdx === -1) {
        res.status(404).json({ success: false, error: 'No pending invite found for this email' });
        return;
      }
      const updatedShared = [...student.sharedWith];
      const current = updatedShared[inviteIdx]!;
      updatedShared[inviteIdx] = {
        ...current,
        userId,
        status: 'accepted',
        acceptedAt: new Date(),
        receiveAlerts: current.receiveAlerts !== false,
        alertChannels: current.alertChannels ?? ['email'],
      };
      await studentRepository.update(student._id!, { sharedWith: updatedShared });
      res.status(200).json({ success: true, message: 'Invite accepted' });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students/:id/contacts/decline
   * Decline a pending invite (authenticated user; email must match).
   */
  router.post('/:id/contacts/decline', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { email } = req.body as { email?: string };
      if (!email) {
        res.status(400).json({ success: false, error: 'Email is required' });
        return;
      }
      const normalizedEmail = (email as string).toLowerCase().trim();
      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      const inviteIdx = student.sharedWith.findIndex(
        (sp) => sp.email === normalizedEmail && sp.status === 'pending'
      );
      if (inviteIdx === -1) {
        res.status(404).json({ success: false, error: 'No pending invite found for this email' });
        return;
      }
      const updatedShared = [...student.sharedWith];
      updatedShared[inviteIdx] = { ...updatedShared[inviteIdx]!, status: 'declined' };
      await studentRepository.update(student._id!, { sharedWith: updatedShared });
      res.status(200).json({ success: true, message: 'Invite declined' });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/students/:id/contacts/:email
   * Update contact. Owner/admin: any field. Contact: only receiveAlerts, alertChannels, alertTypes.
   */
  router.put('/:id/contacts/:email', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      const targetEmail = decodeURIComponent(req.params['email'] ?? '')
        .toLowerCase()
        .trim();
      const idx = student.sharedWith.findIndex((sp) => sp.email === targetEmail);
      if (idx === -1) {
        res.status(404).json({ success: false, error: 'Contact not found' });
        return;
      }
      const isOwnerOrAdmin = student.canAdmin(userId);
      const isSelf = student.sharedWith[idx]!.userId === userId;
      const body = req.body as {
        name?: string;
        phone?: string;
        role?: string;
        receiveAlerts?: boolean;
        alertChannels?: readonly ('email' | 'sms')[];
        alertTypes?: readonly string[];
      };
      const updatedShared = [...student.sharedWith];
      const current = updatedShared[idx]!;
      if (isOwnerOrAdmin) {
        updatedShared[idx] = {
          ...current,
          ...(body.name !== undefined && { name: body.name?.trim() }),
          ...(body.phone !== undefined && { phone: body.phone?.trim() }),
          ...(body.role !== undefined && {
            role: (body.role === 'guardian' || body.role === 'caregiver' ? body.role : 'parent') as
              | 'parent'
              | 'guardian'
              | 'caregiver',
          }),
          ...(body.receiveAlerts !== undefined && { receiveAlerts: body.receiveAlerts }),
          ...(body.alertChannels !== undefined && { alertChannels: body.alertChannels }),
          ...(body.alertTypes !== undefined && { alertTypes: body.alertTypes }),
        };
      } else if (isSelf) {
        updatedShared[idx] = {
          ...current,
          ...(body.receiveAlerts !== undefined && { receiveAlerts: body.receiveAlerts }),
          ...(body.alertChannels !== undefined && { alertChannels: body.alertChannels }),
          ...(body.alertTypes !== undefined && { alertTypes: body.alertTypes }),
        };
      } else {
        res.status(403).json({ success: false, error: 'You can only edit your own contact prefs' });
        return;
      }
      await studentRepository.update(student._id!, { sharedWith: updatedShared });
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/students/:id/contacts/:email
   * Remove a contact. Admin can remove anyone; contact can remove themselves.
   */
  router.delete('/:id/contacts/:email', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      const targetEmail = decodeURIComponent(req.params['email'] ?? '')
        .toLowerCase()
        .trim();
      const isAdmin = student.canAdmin(userId);
      if (!isAdmin) {
        const selfEntry = student.sharedWith.find(
          (sp) => sp.userId === userId && sp.email === targetEmail
        );
        if (!selfEntry) {
          res.status(403).json({ success: false, error: 'You can only remove yourself' });
          return;
        }
      }
      const updatedShared = student.sharedWith.filter((sp) => sp.email !== targetEmail);
      if (updatedShared.length === student.sharedWith.length) {
        res.status(404).json({ success: false, error: 'Contact not found' });
        return;
      }
      await studentRepository.update(student._id!, { sharedWith: updatedShared });
      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/students/:id/owner-alert-prefs
   * Set owner's per-student alert preferences (receiveAlerts, channels, types).
   */
  router.put('/:id/owner-alert-prefs', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      if (student.userId.toString() !== userId) {
        res
          .status(403)
          .json({ success: false, error: 'Only the account owner can set owner alert prefs' });
        return;
      }
      const body = req.body as {
        receiveAlerts?: boolean;
        alertChannels?: readonly ('email' | 'sms')[];
        alertTypes?: readonly string[];
      };
      const prefs = {
        receiveAlerts: body.receiveAlerts ?? true,
        alertChannels: body.alertChannels ?? ['email'],
        alertTypes: body.alertTypes,
      };
      await studentRepository.update(student._id!, { ownerAlertPrefs: prefs });
      res.status(200).json({ success: true, ownerAlertPrefs: prefs });
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
      if (!student.hasAccess(userId)) {
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
  // eslint-disable-next-line complexity
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
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const studentExternalId = student.studentId ?? '';
      const studentDbIdStr = student._id?.toString() ?? '';
      const assignmentsColl = config.database.collection('slc_assignments');
      const coursesColl = config.database.collection('slc_courses');

      const assignmentFilter = studentDbIdStr
        ? {
            userId,
            deletedAt: null,
            $or: [
              { studentId: studentDbIdStr },
              ...(studentExternalId ? [{ studentExternalId }] : []),
            ],
          }
        : { userId, studentExternalId, deletedAt: null };
      const assignmentDocs = await assignmentsColl.find(assignmentFilter).toArray();

      const materialsColl = config.database.collection('slc_course_materials');
      const materialDocs = await materialsColl.find(assignmentFilter).toArray();
      const materialCountByCourse = new Map<string, number>();
      for (const doc of materialDocs) {
        const courseId = (doc['courseExternalId'] as string) ?? '';
        if (courseId)
          materialCountByCourse.set(courseId, (materialCountByCourse.get(courseId) ?? 0) + 1);
      }

      const courseIds = [
        ...new Set(
          assignmentDocs.map((d) => d['courseExternalId'] as string).filter(Boolean) as string[]
        ),
      ];
      const courseMap = new Map<string, string>();
      const courseSourceInfo = new Map<
        string,
        { provider: string; sourceId: string; teacherName?: string; period?: string }
      >();
      if (courseIds.length > 0) {
        const courseDocs = await coursesColl
          .find({ userId, externalId: { $in: courseIds } })
          .toArray();
        for (const c of courseDocs) {
          const extId = c['externalId'] as string;
          const rec = c['record'] as Record<string, unknown> | undefined;
          const name = (rec?.['title'] as string) ?? (rec?.['name'] as string) ?? undefined;
          if (extId && name) courseMap.set(extId, name);
          courseSourceInfo.set(extId, {
            provider: (c['provider'] as string) ?? '',
            sourceId: (c['sourceId'] as string) ?? '',
            teacherName: (rec?.['teacherName'] as string) ?? undefined,
            period: (rec?.['period'] as string) ?? undefined,
          });
        }
      }

      // Cross-source reconciliation: merge courses with the same normalized title
      const sourceCourses: ISourceCourse[] = courseIds.map((id) => {
        const info = courseSourceInfo.get(id);
        return {
          externalId: id,
          sourceId: info?.sourceId ?? '',
          provider: info?.provider ?? '',
          title: courseMap.get(id) ?? id,
          teacherName: info?.teacherName,
          period: info?.period,
        };
      });
      const mergedGroups = mergeCoursesInline(sourceCourses);
      const extIdToMergedId = new Map<string, string>();
      const mergedIdToName = new Map<string, string>();
      const mergedIdToSources = new Map<string, readonly ISourceCourse[]>();
      for (const group of mergedGroups) {
        mergedIdToName.set(group.mergedId, group.normalizedTitle);
        mergedIdToSources.set(group.mergedId, group.sources);
        for (const src of group.sources) {
          extIdToMergedId.set(src.externalId, group.mergedId);
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
        const rawCourseId = (doc['courseExternalId'] as string) ?? '_unknown';
        const courseExternalId = extIdToMergedId.get(rawCourseId) ?? rawCourseId;
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
        materialCount: number;
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

        // Resolve course name: prefer merged name, fall back to courseMap, then raw ID
        const courseName =
          mergedIdToName.get(courseExternalId) ??
          courseMap.get(courseExternalId) ??
          courseExternalId;

        // Aggregate material counts across all source courseExternalIds that mapped to this mergedId
        const sources = mergedIdToSources.get(courseExternalId);
        let matCount = materialCountByCourse.get(courseExternalId) ?? 0;
        if (sources) {
          for (const src of sources) {
            matCount += materialCountByCourse.get(src.externalId) ?? 0;
          }
        }

        courseGrades.push({
          courseExternalId,
          courseName,
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
          materialCount: matCount,
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
   * GET /api/students/:id/materials
   * Get course materials for a student, optionally filtered by course.
   */
  router.get('/:id/materials', async (req: Request, res: Response) => {
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
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const studentExternalId = student.studentId ?? '';
      const studentDbIdStr = student._id?.toString() ?? '';
      const baseUrl = config.baseUrl ?? process.env['API_BASE_URL'] ?? '';

      const materialsColl = config.database.collection('slc_course_materials');
      const coursesColl = config.database.collection('slc_courses');
      const assetsColl = config.database.collection('slc_assets');

      const materialFilter = studentDbIdStr
        ? {
            userId,
            deletedAt: null,
            $or: [
              { studentId: studentDbIdStr },
              ...(studentExternalId ? [{ studentExternalId }] : []),
            ],
          }
        : { userId, studentExternalId, deletedAt: null };

      const courseQueryParam = req.query['course'] as string | undefined;
      const assignmentParam = req.query['assignment'] as string | undefined;

      let assignmentCourseId: string | null = null;
      if (assignmentParam) {
        const assignmentDoc = await config.database.collection('slc_assignments').findOne({
          userId,
          deletedAt: null,
          externalId: assignmentParam,
          $or: [
            { studentId: studentDbIdStr },
            ...(studentExternalId ? [{ studentExternalId }] : []),
          ],
        });
        assignmentCourseId = (assignmentDoc?.['courseExternalId'] as string) ?? null;
      }

      const [materialDocs, courseDocs, assetDocs] = await Promise.all([
        materialsColl.find(materialFilter).toArray(),
        coursesColl.find({ userId, deletedAt: null }).toArray(),
        assetsColl.find({ userId, deletedAt: null, entityType: 'courseMaterial' }).toArray(),
      ]);

      const courseMap = new Map<string, string>();
      for (const c of courseDocs) {
        const extId = c['externalId'] as string;
        const name = (c['record']?.name as string) ?? extId;
        if (extId) courseMap.set(extId, name);
      }

      const assetMap = new Map<string, { assetId: string; fileSize?: number; mimeType?: string }>();
      for (const a of assetDocs) {
        const entityExtId = (a['entityExternalId'] ?? a['entityId']) as string | undefined;
        if (entityExtId) {
          assetMap.set(entityExtId, {
            assetId: ((a['assetId'] ?? a['_id']?.toString()) as string) ?? '',
            fileSize: a['fileSize'] as number | undefined,
            mimeType: a['mimeType'] as string | undefined,
          });
        }
      }

      const grouped = new Map<
        string,
        Array<{
          externalId: string;
          title: string;
          type: string;
          url?: string;
          fileName?: string;
          mimeType?: string;
          postedAt?: string;
          description?: string;
          fileSize?: number;
          assetId?: string;
          downloadUrl?: string;
        }>
      >();

      for (const m of materialDocs) {
        const courseExtId = (m['courseExternalId'] as string) ?? '';
        if (courseQueryParam && courseExtId !== courseQueryParam) continue;

        if (assignmentParam) {
          const rec = m['record'] as Record<string, unknown> | undefined;
          const matAssignmentId = rec?.['assignmentExternalId'] as string | undefined;
          const matchAssignment = matAssignmentId === assignmentParam;
          const matchCourse = assignmentCourseId != null && courseExtId === assignmentCourseId;
          if (!matchAssignment && !matchCourse) continue;
        }

        const extId = (m['externalId'] as string) ?? '';
        const rec = m['record'] as Record<string, unknown> | undefined;
        const asset = assetMap.get(extId);

        const material = {
          externalId: extId,
          title: (rec?.['title'] ?? rec?.['name'] ?? m['title'] ?? '') as string,
          type: (rec?.['type'] ?? m['type'] ?? 'document') as string,
          url: (rec?.['url'] ?? m['url']) as string | undefined,
          fileName: (rec?.['fileName'] ?? m['fileName']) as string | undefined,
          mimeType: asset?.mimeType ?? ((rec?.['mimeType'] ?? m['mimeType']) as string | undefined),
          postedAt: (rec?.['postedAt'] ?? m['postedAt']) as string | undefined,
          description: (rec?.['description'] ?? m['description']) as string | undefined,
          fileSize: asset?.fileSize ?? ((rec?.['fileSize'] ?? m['fileSize']) as number | undefined),
          assetId: asset?.assetId,
          downloadUrl: asset ? `${baseUrl}/api/assets/${asset.assetId}/download` : undefined,
          linkAccessibility: rec?.['linkAccessibility'] as
            | 'public'
            | 'authenticated'
            | 'unknown'
            | undefined,
        };

        const list = grouped.get(courseExtId);
        if (list) {
          list.push(material);
        } else {
          grouped.set(courseExtId, [material]);
        }
      }

      const courses = [...grouped.entries()].map(([courseExternalId, materials]) => ({
        courseExternalId,
        courseName: courseMap.get(courseExternalId) ?? courseExternalId,
        materials,
      }));

      const totalMaterials = courses.reduce((sum, c) => sum + c.materials.length, 0);

      res.status(200).json({
        studentId: studentDbId,
        studentName: student.name,
        totalMaterials,
        courses,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/students/:id/grade-history
   * Get grade trend data for charting. Returns time-series grade snapshots per course.
   * Query params: ?course=<courseExternalId> (optional), ?from=<date>&to=<date> (optional), ?term=<termName> (optional).
   */
  router.get('/:id/grade-history', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const studentId = req.params['id'] ?? '';
      const student = await studentRepository.findById(studentId);
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ error: 'Student not found' });
        return;
      }

      const courseFilter = req.query['course'] as string | undefined;
      const fromParam = req.query['from'] as string | undefined;
      const toParam = req.query['to'] as string | undefined;
      const termParam = req.query['term'] as string | undefined;

      const validation = validateGradeHistoryQuery({ from: fromParam, to: toParam });
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }

      const query: Record<string, unknown> = {
        userId,
        studentExternalId: student.studentId != null ? student.studentId : { $ne: null },
      };
      if (courseFilter) {
        query['courseExternalId'] = courseFilter;
      }

      let dateFilter: { $gte?: string; $lte?: string } | undefined;
      if (fromParam || toParam) {
        dateFilter = {};
        if (fromParam) dateFilter.$gte = fromParam;
        if (toParam) dateFilter.$lte = toParam;
        query['date'] = dateFilter;
      } else if (termParam) {
        const termDocs = await config.database
          .collection('slc_academic_terms')
          .find({ userId })
          .toArray();
        const term = termDocs.find(
          (t) => (t['record'] as Record<string, unknown>)?.['title'] === termParam
        ) as { record?: { startDate?: string; endDate?: string } } | undefined;
        if (term?.record?.startDate != null || term?.record?.endDate != null) {
          const dateRange: Record<string, string> = {};
          if (term.record.startDate != null) dateRange['$gte'] = term.record.startDate;
          if (term.record.endDate != null) dateRange['$lte'] = term.record.endDate;
          query['date'] = dateRange;
        }
      }

      const docs = await config.database
        .collection('slc_grade_history')
        .find(query)
        .sort({ date: 1 })
        .toArray();

      const byCourse = new Map<
        string,
        Array<{ date: string; percentGrade: number; provider: string; sourceType?: string }>
      >();
      for (const doc of docs) {
        const cid = (doc['courseExternalId'] as string) ?? '';
        const list = byCourse.get(cid) ?? [];
        list.push({
          date: (doc['date'] as string) ?? '',
          percentGrade: (doc['percentGrade'] as number) ?? 0,
          provider: (doc['provider'] as string) ?? '',
          sourceType: (doc['sourceType'] as string) ?? undefined,
        });
        byCourse.set(cid, list);
      }

      const courseNames = new Map<string, string>();
      const courseDocs = await config.database.collection('slc_courses').find({ userId }).toArray();
      for (const cd of courseDocs) {
        const eid = (cd['externalId'] as string) ?? (cd['courseExternalId'] as string) ?? '';
        const title = (cd['record'] as Record<string, unknown> | undefined)?.['title'] as
          | string
          | undefined;
        if (eid && title) courseNames.set(eid, title);
      }

      const courses = Array.from(byCourse.entries()).map(([courseExternalId, snapshots]) => ({
        courseExternalId,
        courseName: courseNames.get(courseExternalId) ?? courseExternalId,
        snapshots,
      }));

      res.status(200).json({ studentId, courses });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
    }
  });

  /**
   * DELETE /api/students/:id/grade-history
   * Archive records with date < before. Moves docs to slc_grade_history_archive.
   * Query params: ?before=<date> (required, ISO date string).
   */
  router.delete('/:id/grade-history', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const studentId = req.params['id'] ?? '';
      const student = await studentRepository.findById(studentId);
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ error: 'Student not found' });
        return;
      }
      const before = req.query['before'] as string | undefined;
      if (!before || !/^\d{4}-\d{2}-\d{2}$/.test(before)) {
        res.status(400).json({ error: 'Query param before=<date> required (YYYY-MM-DD)' });
        return;
      }
      if (student.studentId == null) {
        res.status(400).json({ error: 'Student has no external id; cannot archive grade history' });
        return;
      }

      const historyColl = config.database.collection('slc_grade_history');
      const archiveColl = config.database.collection('slc_grade_history_archive');
      const filter = {
        userId,
        studentExternalId: student.studentId,
        date: { $lt: before },
      };
      const docs = await historyColl.find(filter).toArray();
      if (docs.length === 0) {
        res.status(200).json({ archived: 0 });
        return;
      }
      const archivedAt = new Date();
      const toInsert = docs.map((d) => ({
        ...d,
        _id: undefined,
        archivedAt,
      }));
      await archiveColl.insertMany(toInsert);
      const deleteResult = await historyColl.deleteMany(filter);
      const count = deleteResult.deletedCount ?? docs.length;
      res.status(200).json({ archived: count });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
    }
  });

  /**
   * GET /api/students/:id/action-board
   * Get action board buckets for a student.
   */
  // eslint-disable-next-line complexity
  router.get('/:id/action-board', async (req: Request, res: Response) => {
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
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const studentExternalId = student.studentId ?? '';
      const studentDbIdStr = student._id?.toString() ?? '';
      const baseUrl = config.baseUrl ?? '';

      const assignmentsColl = config.database.collection('slc_assignments');
      const coursesColl = config.database.collection('slc_courses');
      const gradeSnapshotsColl = config.database.collection('slc_grade_snapshots');
      const materialsColl = config.database.collection('slc_course_materials');
      const assetsColl = config.database.collection('slc_assets');

      const assignmentFilter = studentDbIdStr
        ? {
            userId,
            deletedAt: null,
            $or: [
              { studentId: studentDbIdStr },
              ...(studentExternalId ? [{ studentExternalId }] : []),
            ],
          }
        : { userId, studentExternalId, deletedAt: null };

      const [assignmentDocs, courseDocs, gradeDocs, materialDocs, assetDocs] = await Promise.all([
        assignmentsColl.find(assignmentFilter).toArray(),
        coursesColl.find({ userId, deletedAt: null }).toArray(),
        gradeSnapshotsColl.find({ userId, deletedAt: null }).toArray(),
        materialsColl.find({ userId, deletedAt: null }).toArray(),
        assetsColl
          .find({
            userId,
            deletedAt: null,
            entityType: { $in: ['assignment', 'courseMaterial'] },
          })
          .toArray(),
      ]);

      const courseMap = new Map<string, { name: string }>();
      for (const c of courseDocs) {
        const extId = c['externalId'] as string;
        const name = (c['record']?.name as string) ?? extId;
        if (extId) courseMap.set(extId, { name });
      }

      const latestGradeByCourse = new Map<string, { percent: number; asOf: string }>();
      for (const g of gradeDocs) {
        const courseExtId = (g['courseExternalId'] ?? g['record']?.courseExternalId) as
          | string
          | undefined;
        if (!courseExtId) continue;
        const asOf = (g['record']?.asOfDate as string) ?? '';
        const raw = g['record']?.percentGrade ?? g['record']?.grade;
        const percent = typeof raw === 'number' ? raw : NaN;
        if (isNaN(percent)) continue;
        const prev = latestGradeByCourse.get(courseExtId);
        if (!prev || asOf >= prev.asOf) {
          latestGradeByCourse.set(courseExtId, { percent, asOf });
        }
      }

      const assetByEntity = new Map<string, (typeof assetDocs)[0][]>();
      for (const a of assetDocs) {
        const key = `${a['entityType'] as string}:${a['entityExternalId'] as string}`;
        if (!assetByEntity.has(key)) assetByEntity.set(key, []);
        assetByEntity.get(key)!.push(a);
      }
      const materialsByCourse = new Map<string, (typeof materialDocs)[0][]>();
      for (const m of materialDocs) {
        const cid = (m['courseExternalId'] ?? m['record']?.courseExternalId) as string | undefined;
        if (!cid) continue;
        if (!materialsByCourse.has(cid)) materialsByCourse.set(cid, []);
        materialsByCourse.get(cid)!.push(m);
      }

      const now = new Date();
      const nowMs = now.getTime();
      const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      type BucketId =
        | 'needs_attention'
        | 'due_soon'
        | 'in_progress'
        | 'recently_graded'
        | 'caught_up';
      const bucketLabels: Record<BucketId, string> = {
        needs_attention: 'Needs Attention',
        due_soon: 'Due Soon',
        in_progress: 'In Progress',
        recently_graded: 'Recently Graded',
        caught_up: 'Caught Up',
      };

      const items: IActionItem[] = [];
      for (const doc of assignmentDocs) {
        const record = (doc['record'] ?? {}) as Record<string, unknown>;
        const externalId = (doc['externalId'] as string) ?? '';
        const courseExternalId = (doc['courseExternalId'] as string) ?? '';
        const title = (record['title'] as string) ?? 'Assignment';
        const dueAt = record['dueAt'] as string | undefined;
        const status = (record['status'] as string) ?? 'unknown';
        const pointsPossible =
          typeof record['pointsPossible'] === 'number' ? record['pointsPossible'] : undefined;
        const pointsEarned =
          typeof record['pointsEarned'] === 'number' ? record['pointsEarned'] : undefined;
        const isOverdue = dueAt ? new Date(dueAt).getTime() < nowMs : false;

        const courseInfo = courseMap.get(courseExternalId);
        const courseName = courseInfo?.name ?? courseExternalId;
        const gradeInfo = latestGradeByCourse.get(courseExternalId);
        const currentGrade = gradeInfo?.percent;
        const letterGrade =
          gradeInfo &&
          (gradeDocs.find(
            (gd) =>
              (gd['courseExternalId'] ?? gd['record']?.courseExternalId) === courseExternalId &&
              (gd['record']?.asOfDate as string) === gradeInfo.asOf
          )?.['record']?.letterGrade as string | undefined);
        const riskLevel =
          currentGrade != null && currentGrade < 70
            ? 'high'
            : currentGrade != null && currentGrade < 80
              ? 'medium'
              : 'none';

        const assignmentAssets = (assetByEntity.get(`assignment:${externalId}`) ?? []).map((a) =>
          buildActionAsset(a as ActionBoardAssetDoc, baseUrl)
        );
        const courseMats = materialsByCourse.get(courseExternalId) ?? [];
        const courseMaterials: IActionAsset[] = [];
        for (const m of courseMats) {
          const mid = m['externalId'] as string;
          const matAssets = assetByEntity.get(`courseMaterial:${mid}`) ?? [];
          courseMaterials.push(
            ...matAssets.map((a) => buildActionAsset(a as ActionBoardAssetDoc, baseUrl))
          );
        }

        items.push({
          assignmentExternalId: externalId,
          title,
          dueAt,
          status,
          pointsPossible,
          pointsEarned,
          isOverdue,
          course: {
            externalId: courseExternalId,
            name: courseName,
            currentGrade,
            letterGrade,
            riskLevel,
          },
          assets: assignmentAssets,
          materials: courseMaterials,
        });
      }

      const bucketOrder: BucketId[] = [
        'needs_attention',
        'due_soon',
        'in_progress',
        'recently_graded',
        'caught_up',
      ];
      const byBucket = new Map<BucketId, IActionItem[]>();
      for (const id of bucketOrder) byBucket.set(id, []);
      for (const item of items) {
        const bucket = determineActionBucket(
          item,
          assignmentDocs as ActionBoardAssignmentDoc[],
          nowMs,
          seventyTwoHoursMs,
          sevenDaysMs
        );
        byBucket.get(bucket)!.push(item);
      }

      const buckets: IActionBucket[] = bucketOrder.map((id) => {
        const list = byBucket.get(id) ?? [];
        return { id, label: bucketLabels[id], count: list.length, items: list };
      });

      res.status(200).json({
        studentId: studentDbId,
        studentName: student.name,
        buckets,
      } as IActionBoardResponse);
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

      const subscription = await subscriptionRepository.findByUserId(userId);
      const currentPlan = subscription?.plan ?? 'free';
      const planFeatures = PLAN_FEATURES[currentPlan];
      const maxStudents = planFeatures.maxStudents;

      if (maxStudents !== -1) {
        const existingStudents = await studentRepository.findByUserId(userId);
        if (existingStudents.length >= maxStudents) {
          res.status(403).json({
            success: false,
            error: `Your ${currentPlan} plan allows up to ${maxStudents} student${maxStudents === 1 ? '' : 's'}. Upgrade to add more.`,
            code: 'PLAN_LIMIT_REACHED',
            currentPlan,
            maxStudents,
            currentCount: existingStudents.length,
          });
          return;
        }
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
      if (!student || !student.hasAccess(userId)) {
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
      if (!student || !student.hasAccess(userId)) {
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
        hasCredentials?: boolean;
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
          hasCredentials: Boolean(ds.credentials?.encrypted),
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
      if (!student || !student.hasAccess(userId)) {
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
      if (!student || !student.hasAccess(userId)) {
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
   * PUT /api/students/:id/sources/:sourceId/credentials
   * Set or update credentials for a source (API token or login for scraping). Stored encrypted.
   */
  router.put('/:id/sources/:sourceId/credentials', async (req: Request, res: Response) => {
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
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((e: { message: string }) => e.message).join('; ');
        res.status(400).json({ success: false, error: msg });
        return;
      }
      const credentials = parsed.data;

      const student = await studentRepository.findById(studentId);
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const idx = student.dataSources.findIndex((ds) => ds.id === sourceId);
      if (idx === -1) {
        res.status(404).json({ success: false, error: 'Source not found' });
        return;
      }

      const plain = JSON.stringify(credentials);
      const encrypted = encryptCredentials(plain);
      if (!encrypted) {
        res.status(503).json({
          success: false,
          error: 'Credential encryption is not configured. Set CREDENTIALS_ENCRYPTION_KEY.',
        });
        return;
      }

      const updatedCredentials: IDataSourceCredentials = {
        encrypted: encrypted.encrypted,
        iv: encrypted.iv,
      };
      const dataSourcesUpdated = student.dataSources.map((d, i) =>
        i === idx ? { ...d, credentials: updatedCredentials } : d
      );
      await studentRepository.update(studentId, { dataSources: dataSourcesUpdated });

      res.status(200).json({ success: true, hasCredentials: true });
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
      if (!student || !student.hasAccess(userId)) {
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
      if (!student || !student.hasAccess(userId)) {
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
      if (!student || !student.hasAccess(userId)) {
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
      if (!student || !student.hasAccess(userId)) {
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

  // =========================================================================
  // Parent sharing routes
  // =========================================================================

  /**
   * GET /api/students/:id/parents
   * List all parents (owner + shared) for a student.
   */
  router.get('/:id/parents', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const parents = [
        {
          userId: student.userId.toString(),
          role: 'parent' as const,
          status: 'accepted' as const,
          isOwner: true,
          isAdmin: true,
        },
        ...student.sharedWith.map((sp) => ({
          userId: sp.userId,
          email: sp.email,
          name: sp.name,
          phone: sp.phone,
          role: sp.role,
          status: sp.status,
          isAdmin: sp.isAdmin ?? false,
          invitedAt: sp.invitedAt?.toISOString(),
          acceptedAt: sp.acceptedAt?.toISOString(),
          isOwner: false,
          receiveAlerts: sp.receiveAlerts !== false,
          alertChannels: sp.alertChannels ?? ['email'],
          alertTypes: sp.alertTypes,
        })),
      ];

      res.status(200).json(parents);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students/:id/parents/invite
   * Invite another parent/guardian to share access to this student.
   * Only the primary owner can invite.
   */
  router.post('/:id/parents/invite', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      if (!student.canAdmin(userId)) {
        res.status(403).json({ success: false, error: 'Only an admin parent can invite others' });
        return;
      }

      const { email, role } = req.body as { email?: string; role?: string };
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ success: false, error: 'Valid email is required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const parentRole = role === 'guardian' || role === 'caregiver' ? role : 'parent';

      // Check if already invited or shared
      const existing = student.sharedWith.find(
        (sp) => sp.email === normalizedEmail && sp.status !== 'declined'
      );
      if (existing) {
        res.status(409).json({ success: false, error: 'This person has already been invited' });
        return;
      }

      // Check if inviting yourself
      // (would need user lookup, but for now just check if userId matches)

      const newShared = [
        ...student.sharedWith,
        {
          email: normalizedEmail,
          role: parentRole as 'parent' | 'guardian' | 'caregiver',
          status: 'pending' as const,
          invitedAt: new Date(),
        },
      ];

      await studentRepository.update(student._id!, { sharedWith: newShared });

      // TODO: Send invite email via SendGrid

      res.status(201).json({
        success: true,
        message: `Invitation sent to ${normalizedEmail}`,
        invite: {
          email: normalizedEmail,
          role: parentRole,
          status: 'pending',
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students/:id/parents/accept
   * Accept a pending invite (called by the invited user after login/register).
   */
  router.post('/:id/parents/accept', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { email } = req.body as { email?: string };
      if (!email) {
        res.status(400).json({ success: false, error: 'Email is required' });
        return;
      }

      const normalizedEmail = email.toLowerCase().trim();
      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const inviteIdx = student.sharedWith.findIndex(
        (sp) => sp.email === normalizedEmail && sp.status === 'pending'
      );
      if (inviteIdx === -1) {
        res.status(404).json({ success: false, error: 'No pending invite found for this email' });
        return;
      }

      const updatedShared = [...student.sharedWith];
      updatedShared[inviteIdx] = {
        ...updatedShared[inviteIdx]!,
        userId,
        status: 'accepted',
        acceptedAt: new Date(),
      };

      await studentRepository.update(student._id!, { sharedWith: updatedShared });

      res.status(200).json({ success: true, message: 'Invite accepted' });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/students/:id/parents/:email/admin
   * Promote or demote a shared parent to/from admin.
   * Only existing admins (owner or promoted) can do this.
   */
  router.put('/:id/parents/:email/admin', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      if (!student.canAdmin(userId)) {
        res
          .status(403)
          .json({ success: false, error: 'Only an admin parent can change admin rights' });
        return;
      }

      const targetEmail = decodeURIComponent(req.params['email'] ?? '')
        .toLowerCase()
        .trim();
      const { isAdmin } = req.body as { isAdmin?: boolean };

      if (typeof isAdmin !== 'boolean') {
        res.status(400).json({ success: false, error: 'isAdmin (boolean) is required' });
        return;
      }

      const idx = student.sharedWith.findIndex(
        (sp) => sp.email === targetEmail && sp.status === 'accepted'
      );
      if (idx === -1) {
        res
          .status(404)
          .json({ success: false, error: 'Accepted shared parent not found with that email' });
        return;
      }

      const updatedShared = [...student.sharedWith];
      updatedShared[idx] = { ...updatedShared[idx]!, isAdmin };

      await studentRepository.update(student._id!, { sharedWith: updatedShared });

      res.status(200).json({
        success: true,
        message: isAdmin
          ? `${targetEmail} has been promoted to admin`
          : `${targetEmail} has been demoted from admin`,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/students/:id/parents/:email
   * Remove a shared parent. Admin can remove anyone; shared parent can remove themselves.
   */
  router.delete('/:id/parents/:email', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const student = await studentRepository.findById(req.params['id'] ?? '');
      if (!student || !student.hasAccess(userId)) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const targetEmail = decodeURIComponent(req.params['email'] ?? '')
        .toLowerCase()
        .trim();
      const isAdmin = student.canAdmin(userId);

      // Non-admin shared parents can only remove themselves
      if (!isAdmin) {
        const selfEntry = student.sharedWith.find(
          (sp) => sp.userId === userId && sp.email === targetEmail
        );
        if (!selfEntry) {
          res.status(403).json({ success: false, error: 'You can only remove yourself' });
          return;
        }
      }

      const updatedShared = student.sharedWith.filter((sp) => sp.email !== targetEmail);

      if (updatedShared.length === student.sharedWith.length) {
        res.status(404).json({ success: false, error: 'Shared parent not found' });
        return;
      }

      await studentRepository.update(student._id!, { sharedWith: updatedShared });

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
