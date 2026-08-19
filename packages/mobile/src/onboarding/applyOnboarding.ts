/**
 * Persist the first-run household: students on the server, one Keychain
 * credential, and one connected source per child. Portal passwords never
 * leave the device.
 */

import * as SecureStore from 'expo-secure-store';
import type {
  IIngestSourceRegisterRequest,
  IStudentCreateRequest,
  IStudentListItem,
} from '@scholaracle/contracts';
import { ApiError } from '../api/ApiError';
import {
  ADAPTER_IDS,
  buildCredentialKey,
  sourceIdForStudent,
  type IConnectedSourceStore,
} from '../sources/ConnectedSourceStore';
import { extractHostname } from '../utils/urlNormalize';
import {
  namedChildDrafts,
  type IOnboardingState,
  type OnboardingProvider,
} from './onboardingMachine';

export interface IOnboardingStudentWriter {
  createStudent(request: IStudentCreateRequest): Promise<IStudentListItem>;
}

export interface IOnboardingSourceRegistrar {
  registerIngestSource(source: IIngestSourceRegisterRequest): Promise<void>;
}

export interface IApplyOnboardingDeps {
  readonly createStudent: IOnboardingStudentWriter['createStudent'];
  readonly registerIngestSource: IOnboardingSourceRegistrar['registerIngestSource'];
  readonly sources: IConnectedSourceStore;
}

export interface IApplyOnboardingResult {
  readonly students: readonly IStudentListItem[];
  readonly planLimitReached: boolean;
}

function parseGrade(raw: string): number | undefined {
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function isPlanLimit(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'PLAN_LIMIT_REACHED';
}

export async function applyOnboarding(
  state: IOnboardingState,
  deps: IApplyOnboardingDeps
): Promise<IApplyOnboardingResult> {
  const provider = state.provider;
  if (!provider) {
    throw new Error('Select a school system before saving');
  }
  const portalUrl = state.portalUrl.trim();
  const institutionExternalId = extractHostname(portalUrl);
  if (institutionExternalId === '') {
    throw new Error('Enter a full portal address like https://school.example.com');
  }

  const credentialKey = buildCredentialKey(provider, portalUrl);
  await SecureStore.setItemAsync(
    credentialKey,
    JSON.stringify({
      username: state.username.trim(),
      password: state.portalPassword,
      baseUrl: portalUrl,
      provider,
      loginMethod: 'direct',
    }),
    { keychainAccessible: SecureStore.WHEN_UNLOCKED }
  );

  const adapterId = ADAPTER_IDS[provider] ?? `com.${provider}`;
  const students: IStudentListItem[] = [];
  let planLimitReached = false;

  for (const child of namedChildDrafts(state)) {
    const grade = parseGrade(child.grade);
    let created: IStudentListItem;
    try {
      created = await deps.createStudent({
        name: child.name.trim(),
        ...(grade != null ? { grade } : {}),
      });
    } catch (err: unknown) {
      if (isPlanLimit(err) && students.length > 0) {
        planLimitReached = true;
        break;
      }
      throw err;
    }
    students.push(created);
    const studentMongoId = created.id;
    const studentExternalId = created.studentId ?? studentMongoId;
    await deps.sources.upsert({
      provider,
      adapterId,
      baseUrl: portalUrl,
      sourceId: sourceIdForStudent(provider, institutionExternalId, studentMongoId),
      credentialKey,
      studentExternalId,
      institutionExternalId,
      studentId: studentMongoId,
      adapterVersion: '0.1.0',
    });
    try {
      await deps.registerIngestSource({
        sourceId: sourceIdForStudent(provider, institutionExternalId, studentMongoId),
        provider,
        adapterId,
        displayName: `${providerLabel(provider)} (${institutionExternalId})`,
        portalBaseUrl: portalUrl,
      });
    } catch {
      // Sync-time re-register heals this.
    }
  }

  if (students.length === 0) {
    throw new Error('Add at least one child');
  }

  return { students, planLimitReached };
}

function providerLabel(provider: OnboardingProvider): string {
  if (provider === 'canvas') return 'Canvas LMS';
  if (provider === 'skyward') return 'Skyward Family Access';
  return 'Aeries Parent Portal';
}
