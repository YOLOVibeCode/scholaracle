import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { StudentRepository } from '@scholaracle/database';
import { NotFoundError, ValidationError } from '@scholaracle/contracts';
import { TodayGuide, WorkPack } from '@scholaracle/studio-core';
import { asyncHandler } from '../../middleware/asyncHandler';
import { resolveStudioStudent, slcStudentFilter, toStudentSession } from './studioScope';
import { createMongoTodaySource } from './mongoTodaySource';
import { createMongoWorkPackSource } from './mongoWorkPackSource';
import { buildOfflinePack } from './mongoOfflinePackSource';

export interface IStudioRouterConfig {
  readonly database: Db;
  readonly baseUrl?: string;
  readonly jwtSecret?: string;
}

const VALID_STUDENT_STATUSES = new Set(['not_started', 'working_on_it', 'need_help', 'done']);

export function studioRouter(config: IStudioRouterConfig): Router {
  const router = Router();
  const studentRepository = new StudentRepository(config.database);
  const baseUrl = config.baseUrl ?? '';

  router.get(
    '/today',
    asyncHandler(async (req: Request, res: Response) => {
      const student = await resolveStudioStudent(req, studentRepository);
      const session = toStudentSession(student);
      const guide = new TodayGuide(
        createMongoTodaySource({
          database: config.database,
          student,
          baseUrl,
          jwtSecret: config.jwtSecret,
        })
      );
      const view = await guide.load(session);
      res.status(200).json(view);
    })
  );

  router.get(
    '/assignments/:externalId',
    asyncHandler(async (req: Request, res: Response) => {
      const externalId = req.params['externalId'] ?? '';
      if (externalId === '') {
        throw new ValidationError('Missing assignment external ID');
      }
      const student = await resolveStudioStudent(req, studentRepository);
      const session = toStudentSession(student);
      const pack = new WorkPack(
        createMongoWorkPackSource({
          database: config.database,
          student,
          baseUrl,
          jwtSecret: config.jwtSecret,
        })
      );
      const view = await pack.load(session, externalId);
      res.status(200).json(view);
    })
  );

  router.get(
    '/courses/:courseExternalId/offline-pack',
    asyncHandler(async (req: Request, res: Response) => {
      const courseExternalId = req.params['courseExternalId'] ?? '';
      if (courseExternalId === '') {
        throw new ValidationError('Missing courseExternalId');
      }
      const student = await resolveStudioStudent(req, studentRepository);
      const pack = await buildOfflinePack({
        database: config.database,
        student,
        courseExternalId,
        baseUrl: config.baseUrl ?? '',
        jwtSecret: config.jwtSecret,
      });
      res.status(200).json(pack);
    })
  );

  router.patch(
    '/assignments/:externalId/status',
    asyncHandler(async (req: Request, res: Response) => {
      const externalId = req.params['externalId'] ?? '';
      if (externalId === '') {
        throw new ValidationError('Missing assignment external ID');
      }
      const student = await resolveStudioStudent(req, studentRepository);
      const body = req.body as { status?: string | null };
      const status = body.status === null || body.status === '' ? null : body.status;
      if (status !== null && (typeof status !== 'string' || !VALID_STUDENT_STATUSES.has(status))) {
        throw new ValidationError(
          `Invalid status. Must be one of: ${[...VALID_STUDENT_STATUSES].join(', ')}`
        );
      }
      const result = await config.database.collection('slc_assignments').updateOne(
        {
          ...slcStudentFilter(student),
          externalId,
        },
        { $set: { studentStatus: status, updatedAt: new Date() } }
      );
      if (result.matchedCount === 0) {
        throw new NotFoundError('Assignment not found');
      }
      res.status(200).json({ success: true, studentStatus: status });
    })
  );

  return router;
}
