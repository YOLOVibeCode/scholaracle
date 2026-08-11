/**
 * Scholaracle Scraper Registry — curated list/get/bundle (Scholaracle-publish only).
 * Sideload is client-local; this API only serves publisher === 'scholaracle'.
 */

import { Router, type Request, type Response } from 'express';
import type { Db, Collection } from 'mongodb';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { IAuthenticatedRequest } from '../../middleware/auth';

export interface IRegistryScraperDoc {
  readonly adapterId: string;
  readonly version: string;
  readonly name: string;
  readonly hosts: readonly string[];
  readonly entities: readonly string[];
  readonly entry: string;
  readonly bundleHash: string;
  readonly publisher: 'scholaracle';
  readonly status: 'published' | 'yanked' | 'pending-review';
  readonly bundle: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IScrapersRouterConfig {
  readonly database: Db;
  /** Optional gate: only these user IDs may publish (Scholaracle staff). */
  readonly publisherUserIds?: readonly string[];
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

export function createScrapersRouter(config: IScrapersRouterConfig): Router {
  const router = Router();
  const col: Collection<IRegistryScraperDoc> = config.database.collection('scraper_registry');

  /** GET /api/scrapers?host=school.instructure.com */
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const host = typeof req.query['host'] === 'string' ? req.query['host'] : undefined;
      const filter: Record<string, unknown> = {
        publisher: 'scholaracle',
        status: 'published',
      };
      const docs = await col.find(filter).sort({ adapterId: 1, version: -1 }).toArray();

      const latestByAdapter = new Map<string, IRegistryScraperDoc>();
      for (const doc of docs) {
        if (!latestByAdapter.has(doc.adapterId)) {
          latestByAdapter.set(doc.adapterId, doc);
        }
      }

      let list = [...latestByAdapter.values()];
      if (host) {
        list = list.filter((d) => d.hosts.some((pattern) => hostMatches(pattern, host)));
      }

      res.status(200).json({
        success: true,
        scrapers: list.map((d) => ({
          adapterId: d.adapterId,
          version: d.version,
          name: d.name,
          hosts: d.hosts,
          entities: d.entities,
          bundleHash: d.bundleHash,
          publisher: d.publisher,
        })),
      });
    })
  );

  /** GET /api/scrapers/:adapterId */
  router.get(
    '/:adapterId',
    asyncHandler(async (req: Request, res: Response) => {
      const adapterId = req.params['adapterId'];
      if (!adapterId) {
        throw new ValidationError('Missing adapterId');
      }
      const versions = await col
        .find({ adapterId, publisher: 'scholaracle', status: 'published' })
        .sort({ version: -1 })
        .toArray();
      if (versions.length === 0) {
        throw new NotFoundError('Scraper not found');
      }
      res.status(200).json({
        success: true,
        adapterId,
        versions: versions.map((d) => ({
          version: d.version,
          name: d.name,
          hosts: d.hosts,
          entities: d.entities,
          bundleHash: d.bundleHash,
          updatedAt: d.updatedAt,
        })),
      });
    })
  );

  /** GET /api/scrapers/:adapterId/versions/:version/bundle */
  router.get(
    '/:adapterId/versions/:version/bundle',
    asyncHandler(async (req: Request, res: Response) => {
      const { adapterId, version } = req.params;
      if (!adapterId || !version) {
        throw new ValidationError('Missing adapterId or version');
      }
      const doc = await col.findOne({
        adapterId,
        version,
        publisher: 'scholaracle',
        status: 'published',
      });
      if (!doc) {
        throw new NotFoundError('Bundle not found');
      }
      res.status(200).json({
        success: true,
        manifest: {
          id: doc.adapterId,
          name: doc.name,
          adapterId: doc.adapterId,
          version: doc.version,
          hosts: doc.hosts,
          entities: doc.entities,
          entry: doc.entry,
          bundleHash: doc.bundleHash,
          publisher: doc.publisher,
        },
        bundle: doc.bundle,
      });
    })
  );

  /** POST /api/scrapers — Scholaracle staff only */
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = getUserId(req);
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }
      const allowed = config.publisherUserIds;
      if (allowed && allowed.length > 0 && !allowed.includes(userId)) {
        throw new ForbiddenError('Only Scholaracle may publish to the registry');
      }

      const body = req.body as Partial<IRegistryScraperDoc>;
      if (
        !body.adapterId ||
        !body.version ||
        !body.name ||
        !body.hosts ||
        !body.bundle ||
        !body.bundleHash
      ) {
        throw new ValidationError('Missing required publish fields');
      }

      const now = new Date();
      const doc: IRegistryScraperDoc = {
        adapterId: body.adapterId,
        version: body.version,
        name: body.name,
        hosts: body.hosts,
        entities: body.entities ?? [],
        entry: body.entry ?? 'dist/scraper.js',
        bundleHash: body.bundleHash,
        publisher: 'scholaracle',
        status: 'published',
        bundle: body.bundle,
        createdAt: now,
        updatedAt: now,
      };

      await col.updateOne(
        { adapterId: doc.adapterId, version: doc.version },
        { $set: doc },
        { upsert: true }
      );

      res.status(201).json({
        success: true,
        adapterId: doc.adapterId,
        version: doc.version,
        bundleHash: doc.bundleHash,
      });
    })
  );

  return router;
}

/** Host pattern match: exact or *.example.com */
export function hostMatches(pattern: string, host: string): boolean {
  const h =
    host
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0] ?? host;
  const p = pattern.toLowerCase();
  if (p.startsWith('*.')) {
    const suffix = p.slice(1); // .example.com
    return h === p.slice(2) || h.endsWith(suffix);
  }
  return h === p;
}
