import { Router, type Request, type Response } from 'express';
import type { Db, ObjectId } from 'mongodb';
import {
  AuthenticationError,
  NotFoundError,
  ValidationError,
  type IPortalAccountUpsertResponse,
  type IPortalBindingUpsertResponse,
  type ISlcBinding,
  type ISlcPortalAccount,
} from '@scholaracle/contracts';
import {
  PortalAccountRepository,
  SlcBindingRepository,
  StudentRepository,
} from '@scholaracle/database';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { portalAccountUpsertSchema, portalBindingUpsertSchema } from './schemas';

export interface IPortalAccountsRouterConfig {
  readonly database: Db;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

function toPortalAccountWire(account: {
  readonly portalAccountId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly portalBaseUrl: string;
  readonly institutionExternalId: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): ISlcPortalAccount {
  return {
    portalAccountId: account.portalAccountId,
    provider: account.provider,
    adapterId: account.adapterId,
    portalBaseUrl: account.portalBaseUrl,
    institutionExternalId: account.institutionExternalId,
    displayName: account.displayName,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

function toBindingWire(binding: {
  readonly portalAccountId: string;
  readonly studentId: ObjectId | string;
  readonly sourceId: string;
  readonly studentExternalId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}): ISlcBinding {
  const studentId =
    typeof binding.studentId === 'string' ? binding.studentId : binding.studentId.toHexString();
  return {
    portalAccountId: binding.portalAccountId,
    studentId,
    sourceId: binding.sourceId,
    studentExternalId: binding.studentExternalId,
    createdAt: binding.createdAt.toISOString(),
    updatedAt: binding.updatedAt.toISOString(),
  };
}

export function portalAccountsRouter(config: IPortalAccountsRouterConfig): Router {
  const router = Router();
  const accountRepo = new PortalAccountRepository(config.database);
  const bindingRepo = new SlcBindingRepository(config.database);
  const studentRepo = new StudentRepository(config.database);

  router.put(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) throw new AuthenticationError('Unauthorized');
      const parsed = portalAccountUpsertSchema.safeParse(req.body);
      if (!parsed.success) throw ValidationError.fromZod(parsed.error);
      const body = parsed.data;
      const account = await accountRepo.upsertByHost({ userId, ...body });
      res.status(200).json({
        portalAccount: toPortalAccountWire(account),
      } satisfies IPortalAccountUpsertResponse);
    })
  );

  router.put(
    '/:portalAccountId/bindings',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) throw new AuthenticationError('Unauthorized');
      const portalAccountId = req.params['portalAccountId'];
      if (!portalAccountId) throw new ValidationError('Missing portalAccountId');
      const parsed = portalBindingUpsertSchema.safeParse(req.body);
      if (!parsed.success) throw ValidationError.fromZod(parsed.error);
      const body = parsed.data;

      const account = await accountRepo.findByPortalAccountId(userId, portalAccountId);
      if (!account) throw new NotFoundError('Portal account not found');

      const student = await studentRepo.findById(body.studentId);
      if (!student || !student.hasAccess(userId)) {
        throw new NotFoundError('Student not found');
      }

      const binding = await bindingRepo.upsert({
        userId,
        portalAccountId,
        studentId: body.studentId,
        sourceId: body.sourceId,
        studentExternalId: body.studentExternalId,
      });

      res.status(200).json({
        binding: toBindingWire(binding),
      } satisfies IPortalBindingUpsertResponse);
    })
  );

  return router;
}
