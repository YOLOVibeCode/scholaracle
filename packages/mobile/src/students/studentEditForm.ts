/**
 * Edit-student form logic. Fields match the web edit form
 * (packages/web/app/dashboard/students/[id]/page.tsx): Name (required),
 * Grade, Student ID. Like the web, an empty optional field is omitted from
 * the PUT body (the server cannot be asked to clear it).
 */

import type { IStudentListItem, IStudentUpdateRequest } from '@scholaracle/contracts';

export interface IStudentEditFields {
  readonly name: string;
  readonly grade: string;
  readonly studentId: string;
}

export type StudentEditBuild =
  | { readonly ok: true; readonly request: IStudentUpdateRequest }
  | { readonly ok: false; readonly error: string };

export function initialStudentEditFields(
  student: Pick<IStudentListItem, 'name' | 'grade' | 'studentId'>
): IStudentEditFields {
  return {
    name: student.name,
    grade: student.grade !== undefined ? String(student.grade) : '',
    studentId: student.studentId ?? '',
  };
}

export function buildStudentUpdate(fields: IStudentEditFields): StudentEditBuild {
  const name = fields.name.trim();
  if (name === '') return { ok: false, error: 'Enter a name.' };

  const gradeRaw = fields.grade.trim();
  let grade: number | undefined;
  if (gradeRaw !== '') {
    if (!/^\d{1,2}$/.test(gradeRaw) || Number.parseInt(gradeRaw, 10) < 1) {
      return { ok: false, error: 'Grade must be a whole number like 6.' };
    }
    grade = Number.parseInt(gradeRaw, 10);
  }

  const studentId = fields.studentId.trim();
  return {
    ok: true,
    request: {
      name,
      ...(grade !== undefined ? { grade } : {}),
      ...(studentId !== '' ? { studentId } : {}),
    },
  };
}

export function hasStudentEditChanges(
  original: Pick<IStudentListItem, 'name' | 'grade' | 'studentId'>,
  fields: IStudentEditFields
): boolean {
  const initial = initialStudentEditFields(original);
  return (
    initial.name !== fields.name.trim() ||
    initial.grade !== fields.grade.trim() ||
    initial.studentId !== fields.studentId.trim()
  );
}
