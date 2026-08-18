/**
 * Google Classroom OAuth: this flow is discontinued.
 *
 * Server-side Classroom data fetching has been removed. School data extraction
 * is performed exclusively on client devices (mobile app, browser extension, or
 * local CLI). The server does not store or use OAuth tokens to call Classroom APIs.
 *
 * Google Classroom on-device sync is not yet available on mobile. When a client
 * implementation ships, it will hold the OAuth tokens locally on the device.
 */
import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import type { AuthService } from '@scholaracle/auth';

export interface IGoogleOAuthConfig {
  readonly database: Db;
  readonly jwtSecret: string;
  readonly baseUrl: string;
  readonly authService: AuthService;
}

export function createGoogleOAuthRouter(_config: IGoogleOAuthConfig): Router {
  const router = Router();

  const discontinued = (_req: Request, res: Response): void => {
    res.status(410).json({
      success: false,
      error:
        'Google Classroom server-side sync has been discontinued. School data extraction runs on the client device only. Google Classroom sync via the mobile app will be available in a future release.',
    });
  };

  router.get('/google/authorize', discontinued);
  router.get('/google/callback', discontinued);

  return router;
}
