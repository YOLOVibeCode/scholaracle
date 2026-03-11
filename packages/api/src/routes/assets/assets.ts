import express, { type Router, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { ConnectorTokenService } from '@scholaracle/auth';
import type { AuthService } from '@scholaracle/auth';
import { IngestSourceRepository } from '@scholaracle/database';
import {
  connectorAuthMiddleware,
  type IConnectorAuthenticatedRequest,
} from '../../middleware/connectorAuth';
import {
  connectorOrUserAuthMiddleware,
  type IAssetAuthenticatedRequest,
} from '../../middleware/connectorOrUserAuth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { AssetRepository } from '../../services/assets/AssetRepository';
import type { IAssetStore } from '../../services/assets/IAssetStore';
import { resolveTermIdsIncludingDescendants } from '../../services/assets/termHierarchy';

export interface IAssetsRouterConfig {
  readonly database: Db;
  readonly jwtSecret: string;
  readonly assetStore: IAssetStore;
  readonly baseUrl: string;
  /** Required for GET/HEAD so web app can download with user JWT. */
  readonly authService?: AuthService;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

/**
 * Router for POST /api/ingest/v1/assets/upload (mount at ingest router under /assets).
 */
export function createAssetUploadRouter(config: IAssetsRouterConfig): Router {
  const router = express.Router();
  const connectorTokenService = new ConnectorTokenService(config.jwtSecret);
  const connectorAuth = connectorAuthMiddleware(connectorTokenService, {
    database: config.database,
  });
  const assetRepo = new AssetRepository(config.database);
  const store = config.assetStore;
  const baseUrl = config.baseUrl.replace(/\/$/, '');

  router.get(
    '/check',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const sourceId = (req.query['sourceId'] as string)?.trim();
      const contentHash = (req.query['contentHash'] as string)?.trim();
      if (!sourceId || !contentHash) {
        res.status(400).json({
          success: false,
          error: 'Missing query parameters: sourceId, contentHash',
        });
        return;
      }
      const existing = await assetRepo.findBySourceIdAndHash(sourceId, contentHash);
      if (existing) {
        const serverUrl = `${baseUrl}/api/assets/${existing.assetId}`;
        res.status(200).json({ exists: true, assetId: existing.assetId, serverUrl });
        return;
      }
      res.status(200).json({ exists: false });
    })
  );

  router.post(
    '/upload',
    connectorAuth,
    upload.single('file'),
    // eslint-disable-next-line complexity
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const file = req.file;
      if (!file?.buffer) {
        res.status(400).json({ success: false, error: 'Missing file' });
        return;
      }
      const sourceId = (req.body?.sourceId as string)?.trim();
      const provider = (req.body?.provider as string)?.trim();
      const originalUrl = (req.body?.originalUrl as string)?.trim();
      const contentHash = (req.body?.contentHash as string)?.trim();
      const fileName = (req.body?.fileName as string)?.trim() || file.originalname || 'file';
      const entityType = (req.body?.entityType as string)?.trim();
      const entityExternalId = (req.body?.entityExternalId as string)?.trim();
      const courseExternalId = (req.body?.courseExternalId as string)?.trim() || undefined;
      const academicTermId = (req.body?.academicTermId as string)?.trim() || undefined;
      if (
        !sourceId ||
        !provider ||
        !originalUrl ||
        !contentHash ||
        !entityType ||
        !entityExternalId
      ) {
        res.status(400).json({
          success: false,
          error:
            'Missing required fields: sourceId, provider, originalUrl, contentHash, entityType, entityExternalId',
        });
        return;
      }

      const existing = await assetRepo.findBySourceIdAndHash(sourceId, contentHash);
      if (existing) {
        const serverUrl = `${baseUrl}/api/assets/${existing.assetId}`;
        res.status(200).json({ assetId: existing.assetId, serverUrl });
        return;
      }

      const assetId = randomUUID();
      const storageKey = `${sourceId}/${assetId}`;
      const { Readable } = await import('node:stream');
      const stream = Readable.from(file.buffer);
      await store.put(storageKey, stream, {
        contentType: file.mimetype || 'application/octet-stream',
        contentLength: file.size,
      });

      await assetRepo.insert({
        assetId,
        sourceId,
        userId,
        originalUrl,
        storageKey,
        fileName,
        mimeType: file.mimetype || 'application/octet-stream',
        fileSize: file.size,
        contentHash,
        entityType,
        entityExternalId,
        courseExternalId,
        academicTermId,
      });

      const serverUrl = `${baseUrl}/api/assets/${assetId}`;
      res.status(200).json({ assetId, serverUrl });
    })
  );

  return router;
}

/**
 * Router for GET/HEAD /api/assets/:assetId and POST /api/assets/prune.
 * GET/HEAD accept connector JWT (scraper) or user JWT (web app); POST upload/prune require connector only.
 */
export function createAssetServeRouter(config: IAssetsRouterConfig): Router {
  const router = express.Router();
  const connectorTokenService = new ConnectorTokenService(config.jwtSecret);
  const connectorAuth = connectorAuthMiddleware(connectorTokenService, {
    database: config.database,
  });
  const assetRepo = new AssetRepository(config.database);
  const store = config.assetStore;

  const downloadAuth =
    config.authService != null
      ? connectorOrUserAuthMiddleware(connectorTokenService, config.authService, {
          database: config.database,
          jwtSecret: config.jwtSecret,
        })
      : connectorAuth;

  router.get(
    '/:assetId',
    downloadAuth,
    asyncHandler(async (req: IAssetAuthenticatedRequest, res: Response) => {
      const userId = req.assetUserId ?? '';
      const assetId = req.params['assetId'];
      if (!assetId) {
        res.status(400).json({ success: false, error: 'Missing assetId' });
        return;
      }
      const asset = await assetRepo.findByAssetId(assetId);
      if (!asset || (!req.signedUrlAccess && asset.userId !== userId)) {
        res.status(404).json({ success: false, error: 'Asset not found' });
        return;
      }
      const etag = `"${asset.contentHash}"`;
      const lastModified =
        asset.uploadedAt instanceof Date
          ? asset.uploadedAt.toUTCString()
          : new Date(asset.uploadedAt as unknown as string).toUTCString();
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', lastModified);
      res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
      const ifNoneMatch = req.get('If-None-Match');
      if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === asset.contentHash)) {
        res.status(304).end();
        return;
      }
      await assetRepo.updateLastAccessed(assetId);
      const { stream } = await store.get(asset.storageKey);
      res.setHeader('Content-Type', asset.mimeType);
      if (asset.fileSize) res.setHeader('Content-Length', String(asset.fileSize));
      stream.pipe(res);
    })
  );

  router.head(
    '/:assetId',
    downloadAuth,
    asyncHandler(async (req: IAssetAuthenticatedRequest, res: Response) => {
      const userId = req.assetUserId ?? '';
      const assetId = req.params['assetId'];
      if (!assetId) {
        res.status(400).end();
        return;
      }
      const asset = await assetRepo.findByAssetId(assetId);
      if (!asset || (!req.signedUrlAccess && asset.userId !== userId)) {
        res.status(404).end();
        return;
      }
      const etag = `"${asset.contentHash}"`;
      const lastModified =
        asset.uploadedAt instanceof Date
          ? asset.uploadedAt.toUTCString()
          : new Date(asset.uploadedAt as unknown as string).toUTCString();
      res.setHeader('ETag', etag);
      res.setHeader('Last-Modified', lastModified);
      res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
      res.setHeader('Content-Type', asset.mimeType);
      res.setHeader('Content-Length', String(asset.fileSize));
      res.status(200).end();
    })
  );

  router.post(
    '/prune',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const { sourceId, termId, cascade } = (req.body ?? {}) as {
        sourceId?: string;
        termId?: string;
        cascade?: boolean;
      };
      if (!sourceId?.trim()) {
        res.status(400).json({ success: false, error: 'Missing sourceId' });
        return;
      }
      const sid = sourceId.trim();
      let count = 0;
      if (termId?.trim()) {
        const tid = termId.trim();
        if (cascade) {
          const sourceRepo = new IngestSourceRepository(config.database);
          const source = await sourceRepo.findByUserIdAndSourceId(userId, sid);
          if (!source) {
            res.status(404).json({ success: false, error: 'Source not found' });
            return;
          }
          const termIds = await resolveTermIdsIncludingDescendants(
            config.database,
            userId,
            source.provider,
            source.adapterId,
            tid
          );
          count = await assetRepo.softDeleteByTermIds(userId, sid, termIds);
        } else {
          count = await assetRepo.softDeleteByTerm(userId, sid, tid);
        }
      } else {
        count = await assetRepo.softDeleteBySourceId(userId, sid);
      }
      res.status(200).json({ success: true, pruned: count });
    })
  );

  return router;
}
