/**
 * SOURCE_INVITE.md §6
 */

import { Router, type Request, type Response } from 'express';
import {
  RateLimitError,
  ValidationError,
  assertNoSecrets,
  type ISourceInviteIssueRequest,
  type ISourceInviteIssueResponse,
  type ISourceInviteRedeemResponse,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import type { IRateLimiter } from '../../middleware/rateLimit';
import type { IInstallLandingRenderer } from '../../services/source-invite/InstallLandingRenderer';
import type { ISourceInviteMailer } from '../../services/source-invite/SourceInviteEmailSender';
import type {
  ISourceInviteIssuer,
  ISourceInviteRedeemer,
} from '../../services/source-invite/SourceInviteService';

export interface ISourceInviteRouterConfig {
  readonly issuer: ISourceInviteIssuer;
  readonly redeemer: ISourceInviteRedeemer;
  readonly mailer: ISourceInviteMailer;
  readonly landing: IInstallLandingRenderer;
  readonly apiPublicOrigin: string;
  readonly webOrigin: string;
  readonly limiter?: IRateLimiter;
}

function stripSlash(origin: string): string {
  return origin.replace(/\/+$/, '');
}

function asRecord(body: unknown): Record<string, unknown> {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }
  return {};
}

export function sourceInvitesRouter(config: ISourceInviteRouterConfig): Router {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;
      const userEmail = authReq.userEmail;
      if (!userId || !userEmail) {
        throw new ValidationError('Authentication required');
      }
      if (config.limiter) {
        const limited = config.limiter.consume(`source-invite:${userId}`, 60 * 60 * 1000, 5);
        if (!limited.allowed) {
          throw new RateLimitError();
        }
      }
      const body = asRecord(req.body);
      if (Object.prototype.hasOwnProperty.call(body, 'to')) {
        throw new ValidationError('Install links are emailed to your account only');
      }
      assertNoSecrets(body);
      const request: ISourceInviteIssueRequest = {
        studentId: String(body['studentId'] ?? ''),
        provider: body['provider'] as ISourceInviteIssueRequest['provider'],
        portalBaseUrl: String(body['portalBaseUrl'] ?? ''),
        ...(typeof body['displayName'] === 'string' ? { displayName: body['displayName'] } : {}),
      };
      const issued = await config.issuer.issue({ userId, request });
      const landingUrl = `${stripSlash(config.apiPublicOrigin)}/install-source?t=${issued.token}`;
      await config.mailer.sendInstallLink({
        to: userEmail,
        providerName: issued.providerName,
        studentName: issued.studentName,
        landingUrl,
        expiresAt: issued.expiresAt,
      });
      const payload: ISourceInviteIssueResponse = {
        success: true,
        expiresAt: issued.expiresAt.toISOString(),
        emailedTo: userEmail,
      };
      res.status(200).json(payload);
    })
  );

  router.post(
    '/redeem',
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;
      if (!userId) {
        throw new ValidationError('Authentication required');
      }
      const body = asRecord(req.body);
      assertNoSecrets(body, { allowKeys: new Set(['token']) });
      const token = typeof body['token'] === 'string' ? body['token'] : '';
      const invite = await config.redeemer.redeem({ userId, token });
      const payload: ISourceInviteRedeemResponse = { success: true, invite };
      res.status(200).json(payload);
    })
  );

  return router;
}

export function installSourceRouter(config: ISourceInviteRouterConfig): Router {
  const router = Router();
  router.get('/', (req: Request, res: Response): void => {
    const raw = typeof req.query['t'] === 'string' ? req.query['t'] : '';
    const html = config.landing.render({ tokenHex: raw, webOrigin: config.webOrigin });
    res.status(200).type('html').send(html);
  });
  return router;
}
