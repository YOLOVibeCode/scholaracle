import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { StudentRepository } from '@scholaracle/database';
import type { IAuthenticatedRequest } from '../../middleware/auth';

export interface IStudentsRouterConfig {
  readonly database: Db;
}

/**
 * Create students router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
export function studentsRouter(config: IStudentsRouterConfig): Router {
  const router = Router();
  const studentRepository = new StudentRepository(config.database);

  /**
   * GET /api/students
   * Get all students for the authenticated user.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const students = await studentRepository.findByUserId(userId);

      res.status(200).json(
        students.map((student) => ({
          id: student._id?.toString() ?? '',
          userId: student.userId.toString(),
          name: student.name,
          grade: student.grade,
          studentId: student.studentId,
          stats: student.stats,
        }))
      );
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/students/:id
   * Get student by ID.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Missing student ID',
        });
        return;
      }
      const student = await studentRepository.findById(id);

      if (!student) {
        res.status(404).json({
          success: false,
          error: 'Student not found',
        });
        return;
      }

      res.status(200).json({
        id: student._id?.toString(),
        userId: student.userId.toString(),
        name: student.name,
        grade: student.grade,
        studentId: student.studentId,
        stats: student.stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/students
   * Create a new student.
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const authReq = req as IAuthenticatedRequest;
      const userId = authReq.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
        return;
      }

      const { name, grade, studentId } = req.body as {
        name?: string;
        grade?: number;
        studentId?: string;
      };

      if (!name) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: name',
        });
        return;
      }

      const student = await studentRepository.create({
        userId,
        name,
        grade,
        studentId,
      });

      res.status(201).json({
        id: student._id?.toString() ?? '',
        userId: student.userId.toString(),
        name: student.name,
        grade: student.grade,
        studentId: student.studentId,
        stats: student.stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/students/:id
   * Update student.
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body as {
        name?: string;
        grade?: number;
        studentId?: string;
      };

      const student = await studentRepository.update(id as string, updates);

      if (!student) {
        res.status(404).json({
          success: false,
          error: 'Student not found',
        });
        return;
      }

      res.status(200).json({
        id: student._id?.toString(),
        userId: student.userId.toString(),
        name: student.name,
        grade: student.grade,
        studentId: student.studentId,
        stats: student.stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/students/:id
   * Delete student.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Missing student ID',
        });
        return;
      }
      const deleted = await studentRepository.delete(id);

      if (!deleted) {
        res.status(404).json({
          success: false,
          error: 'Student not found',
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
  });

  return router;
}

