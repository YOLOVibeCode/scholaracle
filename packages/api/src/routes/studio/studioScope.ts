import type { Request } from 'express';
import { ForbiddenError, type IStudentSession } from '@scholaracle/contracts';
import { StudentRepository, type Student } from '@scholaracle/database';
import type { IAuthenticatedRequest } from '../../middleware/auth';

/** Shared with the weekly-review worker (agents): the one owner-scoped assignment filter. */
export { slcStudentFilter } from '@scholaracle/agents';

export async function resolveStudioStudent(
  req: Request,
  studentRepository: StudentRepository
): Promise<Student> {
  const authReq = req as IAuthenticatedRequest;
  const userId = authReq.userId;
  const studentId = authReq.studentId;
  if (userId === undefined || userId === '' || studentId === undefined || studentId === '') {
    throw new ForbiddenError('Student access required');
  }
  let student: Student | null;
  try {
    student = await studentRepository.findById(studentId);
  } catch {
    throw new ForbiddenError('Student access required');
  }
  if (student === null || student.studentLogin?.userId !== userId) {
    throw new ForbiddenError('Student access required');
  }
  return student;
}

export function toStudentSession(student: Student): IStudentSession {
  return {
    studentId: student._id?.toString() ?? '',
    displayName: student.name,
    showGrades: student.studentLogin?.showGrades === true,
  };
}
