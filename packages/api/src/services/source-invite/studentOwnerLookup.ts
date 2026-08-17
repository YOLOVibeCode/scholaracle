import { ObjectId } from 'mongodb';
import type { IStudentReader } from '@scholaracle/database';

export interface IOwnedStudent {
  readonly id: string;
  readonly name: string;
  readonly studentExternalId: string;
}

export interface IStudentOwnerLookup {
  findOwnedStudent(userId: string, studentId: string): Promise<IOwnedStudent | null>;
}

export class StudentRepositoryOwnerLookup implements IStudentOwnerLookup {
  constructor(private readonly _students: IStudentReader) {}

  async findOwnedStudent(userId: string, studentId: string): Promise<IOwnedStudent | null> {
    if (!ObjectId.isValid(studentId)) return null;
    const student = await this._students.findById(studentId);
    if (!student?._id) return null;
    if (!student.hasAccess(userId)) return null;
    const id = student._id.toString();
    return {
      id,
      name: student.name,
      studentExternalId: student.studentId && student.studentId.length > 0 ? student.studentId : id,
    };
  }
}
