import { Router, type Request, type Response } from 'express';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@scholaracle/contracts';
import type { Student, StudentRepository, UserRepository } from '@scholaracle/database';
import type { INotificationSink } from '@scholaracle/interfaces';
import type { Db } from 'mongodb';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { NudgePublisher } from '../../services/nudge/NudgePublisher';

export interface INudgeRoutesDeps {
  readonly database: Db;
  readonly studentRepository: StudentRepository;
  readonly userRepository: UserRepository;
  readonly sink: INotificationSink;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
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
    throw new ForbiddenError('Only the account owner can nudge this student');
  }
  return student;
}

const noopSink: INotificationSink = {
  async send(): Promise<void> {
    return;
  },
};

/**
 * Parent-only nudge. Mounted on `/api/students` (already requireParent).
 */
export function registerNudgeRoutes(router: Router, deps: INudgeRoutesDeps): void {
  const publisher = new NudgePublisher({
    database: deps.database,
    studentRepository: deps.studentRepository,
    userRepository: deps.userRepository,
    sink: deps.sink,
  });

  router.post(
    '/:id/assignments/:externalId/nudge',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }
      const studentId = req.params['id'] ?? '';
      const externalId = req.params['externalId'] ?? '';
      if (studentId === '' || externalId === '') {
        throw new ValidationError('Missing student or assignment id');
      }
      await requireOwnedStudent(deps.studentRepository, studentId, userId);
      await publisher.nudge(studentId, externalId);
      const student = await deps.studentRepository.findById(studentId);
      const or: Record<string, unknown>[] = [{ studentId }];
      if (student?.studentId) {
        or.push({ studentExternalId: student.studentId });
      }
      const doc = await deps.database.collection('slc_assignments').findOne({
        externalId,
        deletedAt: null,
        $or: or,
      });
      const lastNudgedAt = doc?.['lastNudgedAt'];
      res.status(200).json({
        success: true,
        lastNudgedAt: lastNudgedAt instanceof Date ? lastNudgedAt.toISOString() : lastNudgedAt,
      });
    })
  );
}

export { noopSink };
