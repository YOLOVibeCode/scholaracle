/**
 * Create the first admin when admin_users is empty (e.g. Railway SSH).
 * Usage from repo root: pnpm --filter @scholaracle/api create-admin -- ops@example.com
 * Password: stdin only (pipe or prompt). Never pass as an argument.
 */

const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { MongoClient } = require('mongodb');

function parseEmailFromArgv() {
  const dash = process.argv.indexOf('--');
  const args = dash >= 0 ? process.argv.slice(dash + 1) : process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('-'));
  if (!email || !email.trim()) {
    throw new Error('Usage: create-admin -- <email> (password on stdin or prompt)');
  }
  return email.trim();
}

async function readPasswordFromStdin() {
  if (!input.isTTY) {
    const chunks = [];
    for await (const chunk of input) {
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) {
      throw new Error('Password required on stdin');
    }
    return text;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const password = await rl.question('Password: ');
    return password.trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const { createLogger } = await import('@scholaracle/logger');
  const { AdminUserRepository } = await import('@scholaracle/database');
  const scriptLogger = createLogger('api:create-admin', { level: 'info' });

  const email = parseEmailFromArgv();
  const password = await readPasswordFromStdin();
  if (!password) {
    throw new Error('Password is required');
  }

  const uri = process.env['MONGODB_URI'] ?? process.env['MONGO_URL'];
  if (!uri) {
    throw new Error('MONGODB_URI (or MONGO_URL) is required');
  }
  const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle';
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const repo = new AdminUserRepository(db);
    const existing = await repo.findAll();
    if (existing.length > 0) {
      scriptLogger.warn({ count: existing.length }, 'create-admin: skipped, admin_users not empty');
      return;
    }

    const passwordHash = await AdminUserRepository.hashPassword(password);
    await repo.create({
      email,
      passwordHash,
      name: 'CLI admin',
      role: 'admin',
      createdBy: 'create-admin-cli',
    });
    scriptLogger.info({ email }, 'create-admin: created first admin');
  } finally {
    await client.close();
  }
}

main().catch(async (err) => {
  try {
    const { createLogger } = await import('@scholaracle/logger');
    createLogger('api:create-admin', { level: 'info' }).fatal({ err }, 'create-admin failed');
  } catch {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  }
  process.exit(1);
});
