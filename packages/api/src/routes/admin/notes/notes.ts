import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminNoteRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';

export interface INotesRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

async function handleGetNotesByCustomer(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  try {
    const { customerId } = req.params;
    if (!customerId) {
      res.status(400).json({ success: false, error: 'Customer ID is required' });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleCreateNote(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  try {
    const { customerId } = req.params;
    if (!customerId) {
      res.status(400).json({ success: false, error: 'Customer ID is required' });
      return;
    }

    const authReq = req as IAdminAuthenticatedRequest;
    const { content, category, isInternal } = req.body;

    if (!content || !category) {
      res.status(400).json({
        success: false,
        error: 'Content and category are required',
      });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleUpdateNote(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  try {
    const { noteId } = req.params;
    if (!noteId) {
      res.status(400).json({ success: false, error: 'Note ID is required' });
      return;
    }

    const updates = req.body;
    const updated = await noteRepository.update(noteId, updates);

    if (!updated) {
      res.status(404).json({
        success: false,
        error: 'Note not found',
      });
      return;
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
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleDeleteNote(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  try {
    const { noteId } = req.params;
    if (!noteId) {
      res.status(400).json({ success: false, error: 'Note ID is required' });
      return;
    }

    const success = await noteRepository.delete(noteId);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Note not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleTogglePin(
  req: Request,
  res: Response,
  noteRepository: AdminNoteRepository
): Promise<void> {
  try {
    const { noteId } = req.params;
    if (!noteId) {
      res.status(400).json({ success: false, error: 'Note ID is required' });
      return;
    }

    const { pinned } = req.body;
    if (typeof pinned !== 'boolean') {
      res.status(400).json({
        success: false,
        error: 'Pinned status is required',
      });
      return;
    }

    const success = await noteRepository.togglePin(noteId, pinned);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Note not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export function notesRouter(config: INotesRouterConfig): Router {
  const router = Router();
  const noteRepository = new AdminNoteRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get('/customers/:customerId/notes', (req: Request, res: Response) => {
    void handleGetNotesByCustomer(req, res, noteRepository);
  });

  router.post('/customers/:customerId/notes', (req: Request, res: Response) => {
    void handleCreateNote(req, res, noteRepository);
  });

  router.put('/notes/:noteId', (req: Request, res: Response) => {
    void handleUpdateNote(req, res, noteRepository);
  });

  router.delete('/notes/:noteId', (req: Request, res: Response) => {
    void handleDeleteNote(req, res, noteRepository);
  });

  router.post('/notes/:noteId/pin', (req: Request, res: Response) => {
    void handleTogglePin(req, res, noteRepository);
  });

  return router;
}
