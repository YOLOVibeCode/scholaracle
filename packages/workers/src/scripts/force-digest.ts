/**
 * Force-send a digest email for a student via the production API.
 * Uses device authorization flow (no passwords needed).
 *
 * Usage:
 *   npx ts-node --transpile-only src/scripts/force-digest.ts --studentId=<id>
 *   npx ts-node --transpile-only src/scripts/force-digest.ts --studentId=<id> --apiUrl=https://api.scholarmancy.com
 *   npx ts-node --transpile-only src/scripts/force-digest.ts --studentId=<id> --recipients=email1,email2
 */

import { getCliToken } from './cli-auth';

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length).trim();
  }
  return undefined;
}

async function main(): Promise<void> {
  const studentId = getArg('studentId');
  const apiUrl = getArg('apiUrl') ?? process.env['API_BASE_URL'] ?? 'https://api.scholarmancy.com';
  const recipientsArg = getArg('recipients');

  if (!studentId) {
    // eslint-disable-next-line no-console
    console.error('Usage: --studentId=<id> [--apiUrl=<url>] [--recipients=email1,email2]');
    process.exit(1);
  }

  // Authenticate via device flow (or cached token)
  const token = await getCliToken(apiUrl);

  // Build request body
  const body: Record<string, unknown> = {};
  if (recipientsArg) {
    body['recipients'] = recipientsArg.split(',').map((e) => e.trim());
  } else {
    body['recipients'] = 'all';
  }

  // eslint-disable-next-line no-console
  console.log(`Sending digest for student ${studentId}...`);

  const res = await fetch(`${apiUrl}/api/students/${studentId}/send-digest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const result = (await res.json()) as Record<string, unknown>;

  if (res.ok && result['success']) {
    // eslint-disable-next-line no-console
    console.log('Digest triggered successfully!');
    // eslint-disable-next-line no-console
    console.log('Job ID:', result['jobId']);
    // eslint-disable-next-line no-console
    console.log('Recipients:', JSON.stringify(result['recipients'], null, 2));
  } else {
    // eslint-disable-next-line no-console
    console.error('Failed:', result['error'] ?? JSON.stringify(result));
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
