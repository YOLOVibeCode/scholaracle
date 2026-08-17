/**
 * SOURCE_INVITE.md §6 / §9
 */

import type {
  ISourceInviteIssueRequest,
  ISourceInviteIssueResponse,
  ISourceInvitePayload,
  ISourceInviteRedeemResponse,
} from '@scholaracle/contracts';
import { apiClient } from './client';

export const sourceInvitesApi = {
  async issue(request: ISourceInviteIssueRequest): Promise<ISourceInviteIssueResponse> {
    return apiClient.post<ISourceInviteIssueResponse>('/source-invites', request);
  },

  async redeem(token: string): Promise<ISourceInvitePayload> {
    const res = await apiClient.post<ISourceInviteRedeemResponse>('/source-invites/redeem', {
      token,
    });
    return res.invite;
  },
};
