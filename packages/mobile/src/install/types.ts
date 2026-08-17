/**
 * SOURCE_INVITE.md §4.4 — mobile install ISP types.
 */

import type { ISourceInvitePayload, SourceInviteProvider } from '@scholaracle/contracts';
import type { IConnectedSource, IConnectedSourceStore } from '../sources/ConnectedSourceStore';

export interface IInstallSourceLinkParser {
  isInstallSourceDeepLink(url: string | null | undefined): boolean;
  parseInstallSourceToken(url: string | null | undefined): string | null;
}

export interface ISourceInviteApplier {
  apply(payload: ISourceInvitePayload, store: IConnectedSourceStore): Promise<IConnectedSource>;
}

export interface IPendingSourceInviteStore {
  save(token: string): Promise<void>;
  take(): Promise<string | null>;
}

export interface IConnectSourceInitialState {
  readonly step: 'provider' | 'url' | 'credentials';
  readonly provider: SourceInviteProvider | null;
  readonly portalUrl: string;
  readonly providerLocked: boolean;
  readonly urlLocked: boolean;
}
