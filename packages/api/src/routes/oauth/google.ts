/**
 * Google Classroom OAuth: authorize redirect and callback to store tokens.
 * GET /api/oauth/google/authorize?studentId=&sourceId= — start flow (auth required)
 * GET /api/oauth/google/callback?code=&state= — exchange code, store credentials (no auth)
 */
import { Router, type Request, type Response } from 'express';
import { createHmac } from 'node:crypto';
import type { Db } from 'mongodb';
import { StudentRepository } from '@scholaracle/database';
import type { AuthService } from '@scholaracle/auth';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { authMiddleware } from '../../middleware/auth';
import { encryptCredentials } from '../../utils/credentialsCipher';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

export interface IGoogleOAuthConfig {
  readonly database: Db;
  readonly jwtSecret: string;
  readonly baseUrl: string;
  readonly authService: AuthService;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

function signState(
  payload: { studentId: string; sourceId: string; userId: string },
  secret: string
): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(json).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyState(
  state: string,
  secret: string
): { studentId: string; sourceId: string; userId: string } | null {
  const dot = state.indexOf('.');
  if (dot <= 0) return null;
  const b64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  let json: string;
  try {
    json = Buffer.from(b64, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const expected = createHmac('sha256', secret).update(json).digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(json) as { studentId: string; sourceId: string; userId: string };
  } catch {
    return null;
  }
}

export function createGoogleOAuthRouter(config: IGoogleOAuthConfig): Router {
  const router = Router();
  const { database, jwtSecret, baseUrl, authService } = config;
  const studentRepository = new StudentRepository(database);

  /**
   * GET /api/oauth/google/authorize?studentId=&sourceId=
   * Requires auth. Redirects to Google consent with state = signed(studentId, sourceId, userId).
   */
  router.get('/google/authorize', authMiddleware(authService), (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const studentId = req.query['studentId'] as string | undefined;
    const sourceId = req.query['sourceId'] as string | undefined;
    if (!studentId || !sourceId) {
      res.status(400).json({ success: false, error: 'Missing studentId or sourceId' });
      return;
    }
    const clientId = process.env['GOOGLE_CLASSROOM_CLIENT_ID'];
    if (!clientId) {
      res.status(503).json({ success: false, error: 'Google Classroom OAuth is not configured' });
      return;
    }
    const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/oauth/google/callback`;
    const state = signState({ studentId, sourceId, userId }, jwtSecret);
    const url = new URL(GOOGLE_AUTH_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    const returnUrl = req.query['returnUrl'] === 'true' || req.query['returnUrl'] === '1';
    if (returnUrl) {
      res.json({ url: url.toString() });
      return;
    }
    res.redirect(302, url.toString());
  });

  /**
   * GET /api/oauth/google/callback?code=&state=
   * Exchanges code for tokens, encrypts and stores on student data source, redirects to success.
   */
  router.get('/google/callback', async (req: Request, res: Response) => {
    const code = req.query['code'] as string | undefined;
    const state = req.query['state'] as string | undefined;
    const errorParam = req.query['error'] as string | undefined;
    if (errorParam) {
      res.redirect(
        302,
        `${baseUrl.replace(/\/$/, '')}/dashboard?oauth=error&message=${encodeURIComponent(errorParam)}`
      );
      return;
    }
    if (!code || !state) {
      res.status(400).send('Missing code or state');
      return;
    }
    const payload = verifyState(state, jwtSecret);
    if (!payload) {
      res.status(400).send('Invalid or expired state');
      return;
    }
    const clientId = process.env['GOOGLE_CLASSROOM_CLIENT_ID'];
    const clientSecret = process.env['GOOGLE_CLASSROOM_CLIENT_SECRET'];
    if (!clientId || !clientSecret) {
      res.status(503).send('Google Classroom OAuth is not configured');
      return;
    }
    const redirectUri = `${baseUrl.replace(/\/$/, '')}/api/oauth/google/callback`;
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      res.redirect(
        302,
        `${baseUrl.replace(/\/$/, '')}/dashboard?oauth=error&message=${encodeURIComponent(errText.slice(0, 100))}`
      );
      return;
    }
    const tokenBody = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    const accessToken = tokenBody.access_token;
    const refreshToken = tokenBody.refresh_token;
    if (!accessToken) {
      res.redirect(
        302,
        `${baseUrl.replace(/\/$/, '')}/dashboard?oauth=error&message=no_access_token`
      );
      return;
    }
    const student = await studentRepository.findById(payload.studentId);
    if (!student || !student.hasAccess(payload.userId)) {
      res.status(404).send('Student not found');
      return;
    }
    const idx = student.dataSources.findIndex((ds) => ds.id === payload.sourceId);
    if (idx === -1) {
      res.status(404).send('Source not found');
      return;
    }
    const credentials = {
      authType: 'api' as const,
      accessToken,
      ...(refreshToken && { refreshToken }),
    };
    const plain = JSON.stringify(credentials);
    const encrypted = encryptCredentials(plain);
    if (!encrypted) {
      res.status(503).send('Credential encryption is not configured');
      return;
    }
    const dataSourcesUpdated = student.dataSources.map((d, i) =>
      i === idx ? { ...d, credentials: { encrypted: encrypted.encrypted, iv: encrypted.iv } } : d
    );
    await studentRepository.update(payload.studentId, { dataSources: dataSourcesUpdated });
    res.redirect(302, `${baseUrl.replace(/\/$/, '')}/dashboard?oauth=google_success`);
  });

  return router;
}
