import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ISP — /studio pages stay off parent-only ports', () => {
  it('does not import provisioner, magic-link issuer, or nudge', () => {
    const dir = join(__dirname);
    const files = ['page.tsx', 'layout.tsx', join('assignments', '[externalId]', 'page.tsx')];
    for (const file of files) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src).not.toMatch(/IStudentProvisioner/);
      expect(src).not.toMatch(/IStudentMagicLink/);
      expect(src).not.toMatch(/INudgePublisher/);
      expect(src).not.toMatch(/studentLoginApi/);
      expect(src).not.toMatch(/issueMagicLink/);
    }
  });
});
