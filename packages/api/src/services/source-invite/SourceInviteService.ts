/**
 * SOURCE_INVITE.md §4.3 — issue + redeem. Callers inject the small interface they need.
 */

import {
  NotFoundError,
  SOURCE_INVITE_ADAPTER_IDS,
  SOURCE_INVITE_PROVIDER_NAMES,
  SOURCE_INVITE_REDEEM_ERROR,
  SOURCE_INVITE_TOKEN_BYTES,
  SOURCE_INVITE_TTL_MS,
  ValidationError,
  assertNoSecrets,
  isSourceInviteProvider,
  sanitizeInstallToken,
  type ISourceInviteIssueRequest,
  type ISourceInvitePayload,
} from '@scholaracle/contracts';
import type { ISourceInviteStore } from '@scholaracle/database';
import type { IClock } from './clock';
import { institutionExternalIdFromPortalUrl, normalizePortalUrl } from './normalizePortalUrl';
import type { IStudentOwnerLookup } from './studentOwnerLookup';
import type { ITokenGenerator, ITokenHasher } from './tokens';

export interface IIssuedSourceInvite {
  readonly token: string;
  readonly expiresAt: Date;
  readonly payload: ISourceInvitePayload;
  readonly studentName: string;
  readonly providerName: string;
}

export interface ISourceInviteIssuer {
  issue(params: {
    readonly userId: string;
    readonly request: ISourceInviteIssueRequest;
  }): Promise<IIssuedSourceInvite>;
}

export interface ISourceInviteRedeemer {
  redeem(params: {
    readonly userId: string;
    readonly token: string;
  }): Promise<ISourceInvitePayload>;
}

export class SourceInviteService implements ISourceInviteIssuer, ISourceInviteRedeemer {
  constructor(
    private readonly _store: ISourceInviteStore,
    private readonly _clock: IClock,
    private readonly _tokens: ITokenGenerator,
    private readonly _hasher: ITokenHasher,
    private readonly _students: IStudentOwnerLookup
  ) {}

  async issue(params: {
    readonly userId: string;
    readonly request: ISourceInviteIssueRequest;
  }): Promise<IIssuedSourceInvite> {
    assertNoSecrets(params.request);
    if (!isSourceInviteProvider(params.request.provider)) {
      throw new ValidationError('Unknown provider');
    }
    const portalBaseUrl = normalizePortalUrl(params.request.portalBaseUrl);
    const institutionExternalId = institutionExternalIdFromPortalUrl(portalBaseUrl);
    const student = await this._students.findOwnedStudent(params.userId, params.request.studentId);
    if (!student) {
      throw new NotFoundError('Not found');
    }

    const now = this._clock.now();
    await this._store.invalidateOpen({
      userId: params.userId,
      studentId: student.id,
      provider: params.request.provider,
      institutionExternalId,
      now,
    });

    const adapterId = SOURCE_INVITE_ADAPTER_IDS[params.request.provider];
    const providerName = SOURCE_INVITE_PROVIDER_NAMES[params.request.provider];
    const displayName =
      params.request.displayName?.trim() || `${providerName} (${institutionExternalId})`;
    const payload: ISourceInvitePayload = {
      provider: params.request.provider,
      adapterId,
      portalBaseUrl,
      displayName,
      studentId: student.id,
      studentExternalId: student.studentExternalId,
      institutionExternalId,
    };
    assertNoSecrets(payload);

    const token = this._tokens.randomHex(SOURCE_INVITE_TOKEN_BYTES);
    const tokenHash = this._hasher.hash(token);
    const expiresAt = new Date(now.getTime() + SOURCE_INVITE_TTL_MS);
    await this._store.insert({
      userId: params.userId,
      tokenHash,
      payload,
      expiresAt,
      createdAt: now,
      consumedAt: null,
    });

    return { token, expiresAt, payload, studentName: student.name, providerName };
  }

  async redeem(params: {
    readonly userId: string;
    readonly token: string;
  }): Promise<ISourceInvitePayload> {
    const token = sanitizeInstallToken(params.token);
    if (!token) {
      throw new NotFoundError(SOURCE_INVITE_REDEEM_ERROR);
    }
    const record = await this._store.findByHash(this._hasher.hash(token));
    const now = this._clock.now();
    if (
      !record ||
      record.userId !== params.userId ||
      record.consumedAt !== null ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      throw new NotFoundError(SOURCE_INVITE_REDEEM_ERROR);
    }
    const consumed = await this._store.consumeIfOpen(record.id, now);
    if (!consumed) {
      throw new NotFoundError(SOURCE_INVITE_REDEEM_ERROR);
    }
    return record.payload;
  }
}
