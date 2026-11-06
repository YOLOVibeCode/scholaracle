import type { Db } from 'mongodb';
import { AdminUserRepository } from '@scholaracle/database';
import { logger } from '../logger';

function trimEnv(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * One-time production bootstrap: creates the first admin when env vars are set and
 * admin_users is empty. Operators must remove ADMIN_BOOTSTRAP_* after first login.
 */
export async function maybeBootstrapFirstAdmin(database: Db): Promise<void> {
  const email = trimEnv('ADMIN_BOOTSTRAP_EMAIL');
  const password = trimEnv('ADMIN_BOOTSTRAP_PASSWORD');
  if (!email || !password) return;

  const repo = new AdminUserRepository(database);
  const existing = await repo.findAll();
  if (existing.length > 0) return;

  const passwordHash = await AdminUserRepository.hashPassword(password);
  await repo.create({
    email,
    passwordHash,
    name: 'Bootstrap admin',
    role: 'admin',
    createdBy: 'bootstrap',
  });

  logger.info({ email }, 'admin bootstrap: created first admin');
}
