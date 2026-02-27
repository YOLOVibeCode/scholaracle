/**
 * Test helper: create an admin user with MFA pre-configured and return a valid JWT.
 * Use this in admin route tests so they don't need to run the full MFA setup flow.
 */

import type { Db } from 'mongodb';
import type { Express } from 'express';
import request from 'supertest';
import speakeasy from 'speakeasy';
import { AdminAuthService, MFAService } from '@scholaracle/auth';
import { AdminUserRepository } from '@scholaracle/database';
import type { AdminRole } from '@scholaracle/database';

export interface ICreateTestAdminOptions {
  email: string;
  password: string;
  name: string;
  role: AdminRole;
}

export interface ICreateTestAdminResult {
  token: string;
  admin: { id: string; email: string; name: string; role: AdminRole };
  mfaSecret: string;
}

/**
 * Creates an admin user with MFA already enabled, performs login + MFA verification,
 * and returns the final JWT for use in tests.
 */
export async function createTestAdmin(
  database: Db,
  jwtSecret: string,
  options: ICreateTestAdminOptions
): Promise<ICreateTestAdminResult> {
  const { email, password, name, role } = options;
  const mfaService = new MFAService();
  const authService = new AdminAuthService(database, jwtSecret, undefined, mfaService);
  const adminRepo = new AdminUserRepository(database);

  const { secret } = mfaService.generateSecret(email);
  const passwordHash = await AdminUserRepository.hashPassword(password);

  await adminRepo.create({
    email,
    passwordHash,
    name,
    role,
    mfaEnabled: true,
    mfaSecret: secret,
  });

  const loginResult = await authService.login(email, password);
  if (!loginResult.requiresMFA || !loginResult.mfaToken) {
    throw new Error(`Expected requiresMFA from login, got: ${JSON.stringify(loginResult)}`);
  }

  const totpToken = speakeasy.totp({
    secret,
    encoding: 'base32',
  });

  const verifyResult = await authService.verifyMFAToken(loginResult.mfaToken, totpToken);
  if (!verifyResult.success || !verifyResult.token || !verifyResult.admin) {
    throw new Error(`MFA verification failed: ${JSON.stringify(verifyResult)}`);
  }

  return {
    token: verifyResult.token,
    admin: {
      id: verifyResult.admin.id,
      email: verifyResult.admin.email,
      name: verifyResult.admin.name,
      role: verifyResult.admin.role,
    },
    mfaSecret: secret,
  };
}

/**
 * Obtain a step-up token for an admin that has MFA enabled. Call step-up/start then
 * step-up/verify with a TOTP from the admin's mfaSecret. The app must mount the admin
 * auth router with stepUpChallengeStore configured.
 */
export async function getStepUpToken(
  app: Express,
  adminToken: string,
  mfaSecret: string
): Promise<string> {
  const startRes = await request(app)
    .post('/api/admin/auth/step-up/start')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  if (startRes.status !== 200) {
    throw new Error((startRes.body as { error?: string })?.error ?? 'step-up/start failed');
  }
  const stepUpId = (startRes.body as { data?: { stepUpId?: string } }).data?.stepUpId as string;
  const totp = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });
  const verifyRes = await request(app)
    .post('/api/admin/auth/step-up/verify')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ stepUpId, token: totp });
  if (verifyRes.status !== 200) {
    throw new Error((verifyRes.body as { error?: string })?.error ?? 'step-up/verify failed');
  }
  return (verifyRes.body as { data?: { stepUpToken?: string } }).data?.stepUpToken as string;
}
