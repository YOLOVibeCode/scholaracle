/**
 * Local (on-device) data owned by one student: connected-source registry rows,
 * portal credentials in SecureStore, and run-ledger entries.
 *
 * Mirrors the purge classes in auth/signOut.ts, but scoped to a single
 * student. Two rules differ from a full sign-out:
 *  - A credential key is shared by every student bound to the same portal
 *    account (buildCredentialKey is provider + base URL), so a credential is
 *    deleted only when no remaining source still uses it.
 *  - Credential keys are read from the source registry BEFORE the registry
 *    rows are removed (the registry is the only index of those keys).
 */

import * as SecureStore from 'expo-secure-store';
import { connectedSourceStore, type IConnectedSource } from '../sources/ConnectedSourceStore';
import { runLedger } from '../ledger/RunLedger';

export interface IStudentIdentity {
  /** Mongo id from GET /api/students. */
  readonly id: string;
  /** External (portal) student id, when known. */
  readonly studentId?: string;
}

export interface IStudentLocalDataDeps {
  listSources(): Promise<readonly IConnectedSource[]>;
  removeSource(sourceId: string): Promise<void>;
  deleteCredential(credentialKey: string): Promise<void>;
  removeLedgerEntries(studentExternalIds: readonly string[]): Promise<void>;
}

export const defaultStudentLocalDataDeps: IStudentLocalDataDeps = {
  listSources: () => connectedSourceStore.list(),
  removeSource: (sourceId) => connectedSourceStore.remove(sourceId),
  deleteCredential: (key) => SecureStore.deleteItemAsync(key),
  removeLedgerEntries: (ids) => runLedger.removeByStudentExternalIds(ids),
};

export interface IStudentLocalPurgeResult {
  readonly sourcesRemoved: number;
  readonly credentialsDeleted: number;
  readonly ledgerStudentIds: readonly string[];
}

/** True when a registry row belongs to the student (same match as getForStudentRecord). */
export function sourceBelongsToStudent(
  source: IConnectedSource,
  student: IStudentIdentity
): boolean {
  if (source.studentId !== undefined && source.studentId !== '') {
    return source.studentId === student.id;
  }
  return (
    student.studentId !== undefined &&
    student.studentId !== '' &&
    source.studentExternalId === student.studentId
  );
}

/** Removes one portal source locally; keeps a credential another source still needs. */
export async function removeSourceLocally(
  source: IConnectedSource,
  deps: IStudentLocalDataDeps = defaultStudentLocalDataDeps
): Promise<{ readonly credentialDeleted: boolean }> {
  const all = await deps.listSources();
  const credentialStillUsed = all.some(
    (s) => s.sourceId !== source.sourceId && s.credentialKey === source.credentialKey
  );
  let credentialDeleted = false;
  if (!credentialStillUsed) {
    await deps.deleteCredential(source.credentialKey).catch(() => undefined);
    credentialDeleted = true;
  }
  await deps.removeSource(source.sourceId);
  return { credentialDeleted };
}

/**
 * Purges every local artifact that belongs to the student. Each credential /
 * ledger step is best-effort (a Keychain hiccup must not block the rest);
 * registry removal errors propagate so the caller can tell the user.
 */
export async function purgeStudentLocalData(
  student: IStudentIdentity,
  deps: IStudentLocalDataDeps = defaultStudentLocalDataDeps
): Promise<IStudentLocalPurgeResult> {
  const all = await deps.listSources().catch(() => [] as readonly IConnectedSource[]);
  const mine = all.filter((s) => sourceBelongsToStudent(s, student));
  const others = all.filter((s) => !sourceBelongsToStudent(s, student));

  const usedKeys = new Set(others.map((s) => s.credentialKey));
  const usedExternalIds = new Set(others.map((s) => s.studentExternalId));

  let credentialsDeleted = 0;
  for (const key of new Set(mine.map((s) => s.credentialKey))) {
    if (usedKeys.has(key)) continue;
    await deps.deleteCredential(key).catch(() => undefined);
    credentialsDeleted += 1;
  }

  for (const source of mine) {
    await deps.removeSource(source.sourceId);
  }

  const ledgerIds = new Set<string>(mine.map((s) => s.studentExternalId));
  if (student.studentId !== undefined && student.studentId !== '') {
    ledgerIds.add(student.studentId);
  }
  const ledgerStudentIds = [...ledgerIds].filter((id) => !usedExternalIds.has(id));
  if (ledgerStudentIds.length > 0) {
    await deps.removeLedgerEntries(ledgerStudentIds).catch(() => undefined);
  }

  return { sourcesRemoved: mine.length, credentialsDeleted, ledgerStudentIds };
}
