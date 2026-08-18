/**
 * SOURCE_INVITE.md §8.1
 */

import { SOURCE_INVITE_ADAPTER_IDS, type ISourceInvitePayload } from '@scholaracle/contracts';
import {
  handleInstallLink,
  INSTALL_LINK_EXPIRED_MESSAGE,
  redeemPendingInstall,
} from './handleInstallLink';
import { installSourceLinkParser } from './installSourceDeepLink';
import type { IPendingSourceInviteStore } from './types';

const AVA_TOKEN = 'ab'.repeat(32);
const AVA: ISourceInvitePayload = {
  provider: 'skyward',
  adapterId: SOURCE_INVITE_ADAPTER_IDS.skyward,
  portalBaseUrl: 'https://skyward.iscorp.com',
  displayName: 'Skyward Family Access (skyward.iscorp.com)',
  studentId: 'stu-mongo-1',
  studentExternalId: 'ava-lewis',
  institutionExternalId: 'skyward.iscorp.com',
};

describe('handleInstallLink', () => {
  it('saves pending token when logged out', async () => {
    const pending: IPendingSourceInviteStore = {
      save: jest.fn().mockResolvedValue(undefined),
      take: jest.fn(),
    };
    const redeem = jest.fn();
    await handleInstallLink(`scholarmancy://install-source?t=${AVA_TOKEN}`, {
      parser: installSourceLinkParser,
      pending,
      redeem,
      apply: { apply: jest.fn() },
      isLoggedIn: false,
      onApplied: jest.fn(),
      onError: jest.fn(),
    });
    expect(pending.save).toHaveBeenCalledWith(AVA_TOKEN);
    expect(redeem).not.toHaveBeenCalled();
  });

  it('redeems and applies when logged in', async () => {
    const onApplied = jest.fn();
    const apply = jest.fn().mockResolvedValue({ sourceId: 'local-skyward-skyward.iscorp.com' });
    await handleInstallLink(`scholarmancy://install-source?t=${AVA_TOKEN}`, {
      parser: installSourceLinkParser,
      pending: { save: jest.fn(), take: jest.fn() },
      redeem: jest.fn().mockResolvedValue(AVA),
      apply: { apply },
      isLoggedIn: true,
      onApplied,
      onError: jest.fn(),
    });
    expect(apply).toHaveBeenCalled();
    expect(onApplied).toHaveBeenCalledWith(
      AVA,
      expect.objectContaining({ sourceId: 'local-skyward-skyward.iscorp.com' })
    );
  });

  it('alerts generic expiry on redeem failure', async () => {
    const onError = jest.fn();
    await handleInstallLink(`scholarmancy://install-source?t=${AVA_TOKEN}`, {
      parser: installSourceLinkParser,
      pending: { save: jest.fn(), take: jest.fn() },
      redeem: jest.fn().mockRejectedValue(new Error('nope')),
      apply: { apply: jest.fn() },
      isLoggedIn: true,
      onApplied: jest.fn(),
      onError,
    });
    expect(onError).toHaveBeenCalledWith(INSTALL_LINK_EXPIRED_MESSAGE);
  });

  it('redeemPendingInstall takes then redeems', async () => {
    const onApplied = jest.fn();
    await redeemPendingInstall({
      pending: { save: jest.fn(), take: jest.fn().mockResolvedValue(AVA_TOKEN) },
      redeem: jest.fn().mockResolvedValue(AVA),
      apply: { apply: jest.fn().mockResolvedValue({}) },
      onApplied,
      onError: jest.fn(),
    });
    expect(onApplied).toHaveBeenCalled();
  });
});
