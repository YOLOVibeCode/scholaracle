/**
 * Disconnect a portal source from Settings.
 *
 * 'server-and-local' calls DELETE /api/students/:id/sources/:sourceId FIRST
 * and only then removes the local registry row + credential. If the API call
 * fails nothing local changes, so the phone and the account never disagree
 * about whether the source exists. A 404 ("already gone" on the server) counts
 * as success. 'local-only' keeps the previous behavior.
 */

import { apiClient } from '../api/client';
import { ApiError } from '../api/ApiError';
import type { IConnectedSource } from './ConnectedSourceStore';
import {
  defaultStudentLocalDataDeps,
  removeSourceLocally,
  type IStudentLocalDataDeps,
} from '../students/studentLocalData';

export type DisconnectMode = 'server-and-local' | 'local-only';

export interface IDisconnectDeps {
  deleteServerSource(studentId: string, sourceId: string): Promise<void>;
  local: IStudentLocalDataDeps;
}

export const defaultDisconnectDeps: IDisconnectDeps = {
  deleteServerSource: (studentId, sourceId) => apiClient.deleteStudentSource(studentId, sourceId),
  local: defaultStudentLocalDataDeps,
};

export class DisconnectError extends Error {
  public readonly code: 'NO_STUDENT' | 'SERVER_FAILED';
  constructor(code: 'NO_STUDENT' | 'SERVER_FAILED', message: string) {
    super(message);
    this.name = 'DisconnectError';
    this.code = code;
  }
}

export const DISCONNECT_SERVER_LABEL = 'Disconnect and remove from account';
export const DISCONNECT_LOCAL_LABEL = 'Disconnect on this phone only';

/**
 * `serverOption` defaults to whether the source is bound to a student; Settings passes false for
 * a member of a shared student, who may only remove the phone copy (sharing-spec §4.2).
 */
export function disconnectConfirmText(
  source: IConnectedSource,
  serverOption: boolean = canDisconnectOnServer(source)
): string {
  const what = `${source.provider} (${source.institutionExternalId})`;
  if (!serverOption) {
    return `Removes ${what} and its saved credentials from this phone. Already-synced data stays in your account.`;
  }
  return (
    `"${DISCONNECT_LOCAL_LABEL}" removes ${what} and its saved credentials from this phone; ` +
    'your account keeps the connection and the data already synced. ' +
    `"${DISCONNECT_SERVER_LABEL}" also removes this portal connection from your Scholarmancy account, so it stops syncing from any device.`
  );
}

export function disconnectFailureMessage(err: unknown): string {
  const detail = err instanceof Error ? err.message : 'Unknown error.';
  return `${detail} Nothing was changed on this phone — try again.`;
}

/** The server option needs the Mongo student id the source is bound to. */
export function canDisconnectOnServer(source: IConnectedSource): boolean {
  return source.studentId !== undefined && source.studentId !== '';
}

export async function disconnectSource(
  source: IConnectedSource,
  mode: DisconnectMode,
  deps: IDisconnectDeps = defaultDisconnectDeps
): Promise<void> {
  if (mode === 'server-and-local') {
    if (!canDisconnectOnServer(source)) {
      throw new DisconnectError(
        'NO_STUDENT',
        'This portal is not linked to a student on your account, so only the phone copy can be removed.'
      );
    }
    try {
      await deps.deleteServerSource(source.studentId!, source.sourceId);
    } catch (err: unknown) {
      if (!(err instanceof ApiError && err.status === 404)) {
        throw new DisconnectError(
          'SERVER_FAILED',
          err instanceof Error ? err.message : 'Could not reach your account.'
        );
      }
    }
  }
  await removeSourceLocally(source, deps.local);
}
