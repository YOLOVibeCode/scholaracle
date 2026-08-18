/**
 * SOURCE_INVITE.md §8.1 — extracted from App.tsx so the handler is unit-tested.
 */

import type { ISourceInvitePayload } from '@scholaracle/contracts';
import type { IConnectedSource } from '../sources/ConnectedSourceStore';
import type {
  IInstallSourceLinkParser,
  IPendingSourceInviteStore,
  ISourceInviteApplier,
} from './types';
import { connectedSourceStore } from '../sources/ConnectedSourceStore';

export const INSTALL_LINK_EXPIRED_MESSAGE = 'This install link expired or is not for this account.';

export interface IHandleInstallLinkDeps {
  readonly parser: IInstallSourceLinkParser;
  readonly pending: IPendingSourceInviteStore;
  readonly redeem: (token: string) => Promise<ISourceInvitePayload>;
  readonly apply: ISourceInviteApplier;
  readonly isLoggedIn: boolean;
  readonly onApplied: (payload: ISourceInvitePayload, source: IConnectedSource) => void;
  readonly onError: (message: string) => void;
}

export async function handleInstallLink(
  url: string | null | undefined,
  deps: IHandleInstallLinkDeps
): Promise<void> {
  if (!deps.parser.isInstallSourceDeepLink(url)) return;
  const token = deps.parser.parseInstallSourceToken(url);
  if (!token) {
    deps.onError(INSTALL_LINK_EXPIRED_MESSAGE);
    return;
  }
  if (!deps.isLoggedIn) {
    await deps.pending.save(token);
    return;
  }
  try {
    const payload = await deps.redeem(token);
    const source = await deps.apply.apply(payload, connectedSourceStore);
    deps.onApplied(payload, source);
  } catch {
    deps.onError(INSTALL_LINK_EXPIRED_MESSAGE);
  }
}

export async function redeemPendingInstall(
  deps: Omit<IHandleInstallLinkDeps, 'parser' | 'isLoggedIn'>
): Promise<void> {
  const token = await deps.pending.take();
  if (!token) return;
  try {
    const payload = await deps.redeem(token);
    const source = await deps.apply.apply(payload, connectedSourceStore);
    deps.onApplied(payload, source);
  } catch {
    deps.onError(INSTALL_LINK_EXPIRED_MESSAGE);
  }
}
