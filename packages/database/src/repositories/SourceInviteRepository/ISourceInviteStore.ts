import type { ISourceInvitePayload, SourceInviteProvider } from '@scholaracle/contracts';

export interface ISourceInviteRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly payload: ISourceInvitePayload;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly consumedAt: Date | null;
}

export interface ISourceInviteStore {
  insert(record: Omit<ISourceInviteRecord, 'id'>): Promise<ISourceInviteRecord>;
  findByHash(tokenHash: string): Promise<ISourceInviteRecord | null>;
  consumeIfOpen(id: string, now: Date): Promise<boolean>;
  invalidateOpen(params: {
    readonly userId: string;
    readonly studentId: string;
    readonly provider: SourceInviteProvider;
    readonly institutionExternalId: string;
    readonly now: Date;
  }): Promise<number>;
}
