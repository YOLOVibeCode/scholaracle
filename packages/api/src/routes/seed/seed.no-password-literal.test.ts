import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('seed.ts security invariants', () => {
  it('contains no embedded password string literals', () => {
    const src = readFileSync(join(__dirname, 'seed.ts'), 'utf8');
    expect(src).not.toMatch(/TestPass123!|Admin123!/);
    expect(src).not.toMatch(/password\s*:\s*['"][^'"]+['"]/);
  });
});
