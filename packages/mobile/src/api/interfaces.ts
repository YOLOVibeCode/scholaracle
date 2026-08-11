/**
 * ISP-sliced API interfaces for the mobile companion.
 * One concrete client may implement all; consumers depend on the slice they need.
 */

import type {
  ISlcIngestEnvelopeV1,
  IStudentListItem,
  IStudentGradesResponse,
  IAuthLoginResponse,
} from '@scholaracle/contracts';

export interface IAuthSession {
  login(email: string, password: string): Promise<IAuthLoginResponse>;
  logout(): Promise<void>;
  isLoggedIn(): Promise<boolean>;
}

export interface IConnectorTokenProvider {
  getOrMintConnectorToken(options?: { forceRefresh?: boolean }): Promise<string>;
}

export interface IStudentReadApi {
  getStudents(): Promise<IStudentListItem[]>;
  getStudentAssignments(studentId: string): Promise<readonly unknown[]>;
  getStudentGrades(studentId: string): Promise<IStudentGradesResponse>;
  getStudentRuns(studentId: string): Promise<readonly unknown[]>;
}

export interface IEnvelopeUploader {
  uploadEnvelope(envelope: ISlcIngestEnvelopeV1, connectorToken: string): Promise<void>;
  reportRunFailure(params: {
    readonly runId: string;
    readonly sourceId: string;
    readonly connectorToken: string;
    readonly error: string;
    readonly clientMeta?: Readonly<Record<string, string>>;
  }): Promise<void>;
}

export interface IPushRegistrar {
  registerPushToken(expoPushToken: string): Promise<void>;
  getPushToken(): Promise<string | null>;
}

export interface IRunRecorder {
  startRun(params: {
    runId: string;
    provider: string;
    studentExternalId: string;
    adapterVersion?: string;
    coreVersion?: string;
  }): Promise<void>;
  addPhase(
    runId: string,
    phase: { phase: string; message: string; timestamp: string; durationMs?: number }
  ): Promise<void>;
  completeRun(
    runId: string,
    result: {
      status: 'success' | 'failed' | 'in_progress';
      opCount?: number;
      errorMessage?: string;
    }
  ): Promise<void>;
}
