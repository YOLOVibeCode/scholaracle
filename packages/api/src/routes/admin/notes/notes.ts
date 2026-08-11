import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminNoteRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { NotFoundError, ValidationError } from '@scholaracle/contracts';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface INotesRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

async function handleGetNotesByCustomer(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  const { customerId } = req.params;
  if (!customerId) {
    throw new ValidationError('Customer ID is required');
  }

  const notes = await noteRepository.findByUserId(customerId);

  res.status(200).json({
    success: true,
    data: notes.map(
      (note: {
        _id?: { toString: () => string };
        content: string;
        category: string;
        isInternal: boolean;
        isPinned: boolean;
        adminUserId: string;
        adminName?: string;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        id: note._id?.toString(),
        content: note.content,
        category: note.category,
        isInternal: note.isInternal,
        isPinned: note.isPinned,
        adminUserId: note.adminUserId,
        adminName: note.adminName,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      })
    ),
  });
}

async function handleCreateNote(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  const { customerId } = req.params;
  if (!customerId) {
    throw new ValidationError('Customer ID is required');
  }

  const authReq = req as IAdminAuthenticatedRequest;
  const { content, category, isInternal } = req.body;

  if (!content || !category) {
    throw new ValidationError('Content and category are required');
  }

  const note = await noteRepository.create({
    userId: customerId,
    adminUserId: authReq.adminId!,
    adminName: authReq.adminEmail,
    content,
    category,
    isInternal,
  });

  res.status(201).json({
    success: true,
    data: {
      id: note._id?.toString(),
      content: note.content,
      category: note.category,
      isInternal: note.isInternal,
      createdAt: note.createdAt.toISOString(),
    },
  });
}

async function handleUpdateNote(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  const { noteId } = req.params;
  if (!noteId) {
    throw new ValidationError('Note ID is required');
  }

  const updates = req.body;
  const updated = await noteRepository.update(noteId, updates);

  if (!updated) {
    throw new NotFoundError('Note not found');
  }

  res.status(200).json({
    success: true,
    data: {
      id: updated._id?.toString(),
      content: updated.content,
      category: updated.category,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

async function handleDeleteNote(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  const { noteId } = req.params;
  if (!noteId) {
    throw new ValidationError('Note ID is required');
  }

  const success = await noteRepository.delete(noteId);

  if (!success) {
    throw new NotFoundError('Note not found');
  }

  res.status(200).json({
    success: true,
  });
}

async function handleTogglePin(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  const { noteId } = req.params;
  if (!noteId) {
    throw new ValidationError('Note ID is required');
  }

  const { pinned } = req.body;
  if (typeof pinned !== 'boolean') {
    throw new ValidationError('Pinned status is required');
  }

  const success = await noteRepository.togglePin(noteId, pinned);

  if (!success) {
    throw new NotFoundError('Note not found');
  }

  res.status(200).json({
    success: true,
  });
}

export function notesRouter(config: INotesRouterConfig): Router {
  const router = Router();
  const noteRepository = new AdminNoteRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get(
    '/customers/:customerId/notes',
    asyncHandler((req: Request, res: Response) =>
      handleGetNotesByCustomer(req, res, noteRepository)
    )
  );

  router.post(
    '/customers/:customerId/notes',
    asyncHandler((req: Request, res: Response) => handleCreateNote(req, res, noteRepository))
  );

  router.put(
    '/notes/:noteId',
    asyncHandler((req: Request, res: Response) => handleUpdateNote(req, res, noteRepository))
  );

  router.delete(
    '/notes/:noteId',
    asyncHandler((req: Request, res: Response) => handleDeleteNote(req, res, noteRepository))
  );

  router.post(
    '/notes/:noteId/pin',
    asyncHandler((req: Request, res: Response) => handleTogglePin(req, res, noteRepository))
  );

  return router;
}
