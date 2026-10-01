import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..', '..');
const SCAN_DIRS = ['packages/api/src', 'packages/agents/src', 'packages/workers/src'] as const;
const ALLOWED_RELAY_FILE = 'packages/agents/src/sms/NoctusoftSmsRelayClient.ts';

function listTsFiles(dir: string): string[] {
  const abs = join(ROOT, dir);
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const p = join(abs, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      out.push(...listTsFiles(join(dir, name)));
    } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
      out.push(join(dir, name));
    }
  }
  return out;
}

describe('SMS send surface', () => {
  it('only NoctusoftSmsRelayClient calls /sms/send or messages.create', () => {
    const violations: string[] = [];
    for (const rel of SCAN_DIRS.flatMap((d) => listTsFiles(d))) {
      if (rel === ALLOWED_RELAY_FILE) {
        continue;
      }
      const src = readFileSync(join(ROOT, rel), 'utf8');
      if (src.includes('/sms/send') || src.includes('messages.create')) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});
