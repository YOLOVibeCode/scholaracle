import { Router, type Request, type Response } from 'express';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type IStudentLoginStatus,
} from '@scholaracle/contracts';
import type { Student, StudentRepository } from '@scholaracle/database';
import type { IStudentLoginStatus as IProvisionStatus } from '@scholaracle/interfaces';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { StudentProvisioner } from '../../services/provision/StudentProvisioner';
import type { StudentMagicLink } from '../../services/provision/StudentMagicLink';
import type { MagicLoginLink } from '../../services/provision/MagicLoginLink';
import type { IMagicLinkSender } from '../../services/provision/MagicLinkSender';

export interface IStudentLoginRoutesDeps {
  readonly studentRepository: StudentRepository;
  readonly provisioner: StudentProvisioner;
  readonly magicLinks: StudentMagicLink;
  readonly magicLoginLink?: MagicLoginLink;
  readonly magicLinkSender?: IMagicLinkSender;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

function toWire(status: IProvisionStatus): IStudentLoginStatus {
  return {
    provisioned: status.provisioned,
    showGrades: status.showGrades,
    ...(status.email !== undefined ? { email: status.email } : {}),
    ...(status.createdAt !== undefined ? { createdAt: status.createdAt.toISOString() } : {}),
    ...(status.userId !== undefined ? { userId: status.userId } : {}),
  };
}

async function requireOwnedStudent(
  studentRepository: StudentRepository,
  studentId: string,
  parentUserId: string
): Promise<Student> {
  let student: Student | null;
  try {
    student = await studentRepository.findById(studentId);
  } catch {
    throw new NotFoundError('Student not found');
  }
  if (student === null) {
    throw new NotFoundError('Student not found');
  }
  if (student.userId.toString() !== parentUserId) {
    throw new ForbiddenError('Only the account owner can manage this student login');
  }
  return student;
}

/**
 * Parent-only student login routes. Mounted on `/api/students` (already requireParent).
 */
export function registerStudentLoginRoutes(router: Router, deps: IStudentLoginRoutesDeps): void {
  const { studentRepository, provisioner, magicLinks, magicLoginLink, magicLinkSender } = deps;

  router.get(
    '/:id/login',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }
      await requireOwnedStudent(studentRepository, req.params['id'] ?? '', userId);
      const status = await provisioner.getStatus(req.params['id'] ?? '');
      res.status(200).json(toWire(status));
    })
  );

  router.post(
    '/:id/login',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }
      await requireOwnedStudent(studentRepository, req.params['id'] ?? '', userId);
      const body = req.body as { email?: unknown };
      const email = typeof body.email === 'string' ? body.email : undefined;
      const result = await provisioner.invite(req.params['id'] ?? '', email);
      res.status(200).json({
        email: result.email,
        temporaryPassword: result.temporaryPassword,
      });
    })
  );

  router.post(
    '/:id/login/magic-link',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }
      const student = await requireOwnedStudent(studentRepository, req.params['id'] ?? '', userId);
      if (student.studentLogin === undefined) {
        throw new NotFoundError('Student login not found');
      }
      const issued = await magicLinks.issue(student._id?.toString() ?? req.params['id'] ?? '');
      res.status(200).json({
        loginUrl: issued.loginUrl,
        expiresAt: issued.expiresAt.toISOString(),
        qrDataUrl: issued.qrDataUrl,
      });
    })
  );

  /**
   * POST /api/students/:id/login/magic-link/send
   * Owner only: issue a 24h magic link and send it to the student via email or SMS.
   */
  router.post(
    '/:id/login/magic-link/send',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }
      const student = await requireOwnedStudent(studentRepository, req.params['id'] ?? '', userId);
      if (student.studentLogin === undefined) {
        throw new NotFoundError('Student login not found');
      }
      if (!magicLoginLink || !magicLinkSender) {
        throw new NotFoundError('Magic link delivery is not configured');
      }

      const body = req.body as { channel?: unknown; to?: unknown };
      const channel = body.channel;
      const to = typeof body.to === 'string' ? body.to.trim() : undefined;

      if (channel !== 'email' && channel !== 'sms') {
        throw new ValidationError('channel must be "email" or "sms"');
      }
      if (!to) {
        throw new ValidationError('to is required');
      }

      const issued = await magicLoginLink.issueForStudent(
        student._id?.toString() ?? req.params['id'] ?? ''
      );

      if (channel === 'email') {
        await magicLinkSender.sendEmail({
          to,
          loginUrl: issued.loginUrl,
          recipientName: student.name,
        });
      } else {
        await magicLinkSender.sendSms({ to, loginUrl: issued.loginUrl });
      }

      res.status(200).json({ success: true, expiresAt: issued.expiresAt.toISOString() });
    })
  );

  router.patch(
    '/:id/login',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }
      await requireOwnedStudent(studentRepository, req.params['id'] ?? '', userId);
      const body = req.body as { showGrades?: unknown };
      if (typeof body.showGrades !== 'boolean') {
        throw new ValidationError('showGrades must be a boolean');
      }
      await provisioner.setShowGrades(req.params['id'] ?? '', body.showGrades);
      const status = await provisioner.getStatus(req.params['id'] ?? '');
      res.status(200).json(toWire(status));
    })
  );

  router.delete(
    '/:id/login',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }
      const student = await requireOwnedStudent(studentRepository, req.params['id'] ?? '', userId);
      if (student.studentLogin === undefined) {
        throw new NotFoundError('Student login not found');
      }
      await provisioner.revoke(student.studentLogin.userId);
      res.status(200).json({ success: true });
    })
  );
}
