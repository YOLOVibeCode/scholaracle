import { Router, type Request, type Response } from 'express';
import { ObjectId, type Db } from 'mongodb';
import {
  AuthenticationError,
  ValidationError,
  type IMySharingStudent,
  type IMySharingView,
  type ISharingInviteResult,
  type ISharingInviteSelectionResult,
  type ISharingPendingInvite,
} from '@scholaracle/contracts';
import {
  StudentRepository,
  UserRepository,
  effectiveSharedAlertPrefs,
  type Student,
} from '@scholaracle/database';
import { asyncHandler } from '../../middleware/asyncHandler';
import {
  parseSharingInviteBody,
  parseSharingSelection,
  type SharingService,
} from '../../services/sharing/SharingService';
import { getUserEmail, requireUserId } from '../../services/sharing/sharingIdentity';
import { inviterIdFor, inviterNameMap } from '../../services/sharing/inviterNames';

export interface ISharingRouterConfig {
  readonly database: Db;
  /**
   * The ONE SharingService of the process (built in server.ts, shared with the students router),
   * so invitations, links, opt-in and limits behave the same on every route.
   */
  readonly sharing: SharingService;
}

/** Caller email from the JWT, or 401. Sharing never reads an email from a body or query. */
function requireUserEmail(req: Request): string {
  const email = getUserEmail(req);
  if (email === null) {
    throw new AuthenticationError('Unauthorized');
  }
  return email;
}

function myStudentView(
  student: Student,
  userId: string,
  names: Map<string, string>
): IMySharingStudent | null {
  const access = student.accessFor(userId);
  if (access === null) return null;
  const studentId = student._id?.toString() ?? '';
  // One source of truth for defaults (Student model) so display matches delivery.
  const alerts = student.alertPrefsFor(userId) ?? effectiveSharedAlertPrefs({});
  if (access === 'owner') {
    return { studentId, name: student.name, access, alerts };
  }
  const row = student.sharedWith.find((sp) => sp.status === 'accepted' && sp.userId === userId);
  const inviterId = row?.invitedByUserId ?? student.userId.toString();
  const inviterName = names.get(inviterId);
  return {
    studentId,
    name: student.name,
    access,
    invitedBy: { userId: inviterId, ...(inviterName ? { name: inviterName } : {}) },
    alerts,
  };
}

/**
 * `/api/sharing`: the parts of sharing that span students (sharing-spec §4.3). Mounted behind
 * the same auth + requireParent as `/api/students`. Per-student management stays on
 * `/api/students/:id/contacts*`.
 */
export function sharingRouter(config: ISharingRouterConfig): Router {
  const router = Router();
  const students = new StudentRepository(config.database);
  const users = new UserRepository(config.database);
  const service = config.sharing;

  /**
   * POST /api/sharing/invites
   * One person, one or more students, one email. Admin on every student; duplicates are
   * reported per student, never an error. 20 invitations per account per day.
   */
  router.post(
    '/invites',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const input = parseSharingInviteBody(req.body);
      const outcome = await service.invite(req, userId, input);
      const body: ISharingInviteResult = {
        inviteGroupId: outcome.inviteGroupId,
        perStudent: outcome.perStudent,
        ...(outcome.smsOptInUrl ? { smsOptInUrl: outcome.smsOptInUrl } : {}),
      };
      res.status(201).json(body);
    })
  );

  /**
   * GET /api/sharing/invites/pending
   * Pending invitations addressed to the caller's own email (never a query parameter).
   */
  router.get(
    '/invites/pending',
    asyncHandler(async (req: Request, res: Response) => {
      requireUserId(req);
      const email = getUserEmail(req);
      if (email === null) {
        res.status(200).json([]);
        return;
      }
      const pending = await students.findPendingInvites(email);
      const rows = pending.flatMap((s) => {
        const sp = s.sharedWith.find((e) => e.email === email && e.status === 'pending');
        return sp ? [{ student: s, sp }] : [];
      });
      const names = await inviterNameMap(
        users,
        rows.map(({ student, sp }) => sp.invitedByUserId ?? student.userId.toString())
      );
      const invites: ISharingPendingInvite[] = rows.map(({ student, sp }) => {
        const invitedBy = sp.invitedByUserId ?? student.userId.toString();
        const invitedByName = names.get(invitedBy);
        return {
          studentId: student._id?.toString() ?? '',
          studentName: student.name,
          invitedBy,
          ...(invitedByName ? { invitedByName } : {}),
          ...(sp.inviteGroupId ? { inviteGroupId: sp.inviteGroupId } : {}),
          invite: {
            email: sp.email,
            role: sp.role,
            status: 'pending',
            invitedAt: sp.invitedAt.toISOString(),
            isAdmin: sp.isAdmin === true,
          },
        };
      });
      res.status(200).json(invites);
    })
  );

  /** POST /api/sharing/invites/accept  { inviteGroupId } | { studentIds } */
  router.post(
    '/invites/accept',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const email = requireUserEmail(req);
      const selection = parseSharingSelection(req.body);
      const studentIds = await service.accept(req, email, userId, selection);
      res.status(200).json({ success: true, studentIds } satisfies ISharingInviteSelectionResult);
    })
  );

  /** POST /api/sharing/invites/decline  { inviteGroupId } | { studentIds } */
  router.post(
    '/invites/decline',
    asyncHandler(async (req: Request, res: Response) => {
      requireUserId(req);
      const email = requireUserEmail(req);
      const selection = parseSharingSelection(req.body);
      const studentIds = await service.decline(req, email, selection);
      res.status(200).json({ success: true, studentIds } satisfies ISharingInviteSelectionResult);
    })
  );

  /** POST /api/sharing/invites/:groupId/resend  (admin on every student; 5 per group per day) */
  router.post(
    '/invites/:groupId/resend',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const groupId = (req.params['groupId'] ?? '').trim();
      if (groupId === '') {
        throw new ValidationError('Missing invite group id');
      }
      const outcome = await service.resend(req, userId, groupId);
      res.status(200).json({
        success: true,
        studentIds: outcome.studentIds,
        expiresAt: outcome.expiresAt.toISOString(),
      });
    })
  );

  /**
   * POST /api/sharing/invites/resend-contact  { studentId, email }
   * Re-send one pending person's invitation on one student. A row invited before invitation
   * groups existed gets a single-student group minted here, so its email carries a working
   * 7-day link. Admin on the student; rate-limited like resend.
   */
  router.post(
    '/invites/resend-contact',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const body = (req.body ?? {}) as { studentId?: unknown; email?: unknown };
      const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : '';
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!ObjectId.isValid(studentId)) {
        throw new ValidationError('studentId must be a student id');
      }
      if (!email.includes('@')) {
        throw new ValidationError('Valid email is required');
      }
      const outcome = await service.resendContact(req, userId, studentId, email);
      res.status(200).json({
        success: true,
        studentIds: outcome.studentIds,
        expiresAt: outcome.expiresAt.toISOString(),
        inviteGroupId: outcome.inviteGroupId,
      });
    })
  );

  /** POST /api/sharing/leave  { studentId }: the caller stops following a student. */
  router.post(
    '/leave',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const email = requireUserEmail(req);
      const studentId = (req.body as { studentId?: unknown } | undefined)?.studentId;
      if (typeof studentId !== 'string' || studentId.trim() === '') {
        throw new ValidationError('studentId is required');
      }
      await service.leave(req, userId, email, studentId.trim());
      res.status(200).json({ success: true });
    })
  );

  /** GET /api/sharing/mine: every accessible student with the caller's access and alert prefs. */
  router.get(
    '/mine',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const accessible = await students.findByUserId(userId);
      const names = await inviterNameMap(
        users,
        accessible.flatMap((s) => {
          const inviterId = inviterIdFor(s, userId);
          return inviterId ? [inviterId] : [];
        })
      );
      const view: IMySharingView = {
        students: accessible.flatMap((s) => {
          const item = myStudentView(s, userId, names);
          return item ? [item] : [];
        }),
      };
      res.status(200).json(view);
    })
  );

  return router;
}
