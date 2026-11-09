/**
 * Remove a student: server first, then the local purge.
 *
 * Order matters for consistency: if the API call fails nothing local is
 * touched (the student still exists and still syncs); if it succeeds the
 * local purge runs. A 404 means the student is already gone server-side, so
 * the local purge still runs.
 */

import { apiClient } from '../api/client';
import { ApiError } from '../api/ApiError';
import {
  purgeStudentLocalData,
  type IStudentIdentity,
  type IStudentLocalPurgeResult,
} from './studentLocalData';

export interface IRemoveStudentDeps {
  deleteStudent(id: string): Promise<void>;
  purgeLocal(student: IStudentIdentity): Promise<IStudentLocalPurgeResult>;
}

export const defaultRemoveStudentDeps: IRemoveStudentDeps = {
  deleteStudent: (id) => apiClient.deleteStudent(id),
  purgeLocal: (student) => purgeStudentLocalData(student),
};

export async function removeStudent(
  student: IStudentIdentity,
  deps: IRemoveStudentDeps = defaultRemoveStudentDeps
): Promise<IStudentLocalPurgeResult> {
  try {
    await deps.deleteStudent(student.id);
  } catch (err: unknown) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }
  return deps.purgeLocal(student);
}

export function removeStudentConfirmText(name: string): string {
  return `Removes ${name} from your Scholarmancy account and deletes this student's saved portal passwords and sync history from this phone. This cannot be undone.`;
}
