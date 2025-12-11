import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';

export interface IAuthRouterConfig {
  readonly database: Db;
}

/**
 * Handle register request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param authService - Auth service
 */
async function handleRegister(
  req: Request,
  res: Response,
  authService: AuthService
): Promise<void> {
  try {
    const { email, password, name } = req.body as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!email || !password || !name) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password, name',
      });
      return;
    }

    const result = await authService.register(email, password, name);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * Handle login request.
 *
 * @param req - Express request
 * @param res - Express response
 * @param authService - Auth service
 */
async function handleLogin(req: Request, res: Response, authService: AuthService): Promise<void> {
  try {
    const { email, password } = req.body as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password',
      });
      return;
    }

    const result = await authService.login(email, password);

    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

/**
 * Create auth router.
 *
 * @param config - Router configuration
 * @returns Express router
 */
export function authRouter(config: IAuthRouterConfig): Router {
  const router = Router();
  const authService = new AuthService(config.database);

  /**
   * POST /api/auth/register
   * Register a new user.
   */
  router.post('/register', (req: Request, res: Response) => {
    void handleRegister(req, res, authService);
  });

  /**
   * POST /api/auth/login
   * Login user.
   */
  router.post('/login', (req: Request, res: Response) => {
    void handleLogin(req, res, authService);
  });

  return router;
}
