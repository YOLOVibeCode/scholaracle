import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runInNewContext } from 'vm';
import {
  COMPANION_ENV_FILE,
  GENERATED_MODULE,
  renderSeedExpression,
  renderSeedModule,
  syncCompanionDevSeed,
} from '../../scripts/companion-dev-seed';

/**
 * companion.env.local holds a developer's own school-portal sign-in. metro.config.js turns it into
 * companionDevSeed.generated.ts every time the bundler starts, and that module is part of the app.
 * It used to do so for production exports too, so an OTA update or a release build made on a
 * machine that had the file would have carried the sign-in to every phone.
 *
 * Two rules now keep it out (scripts/companion-dev-seed.js). Both are held here. All values in this
 * file are fake.
 */

const FAKE_USERNAME = 'fake-parent-user';
const FAKE_SECRET = 'fake-portal-secret';
const FAKE_SEED = {
  provider: 'canvas',
  baseUrl: 'https://fake-school.example.test',
  username: FAKE_USERNAME,
  password: FAKE_SECRET,
  studentExternalId: 'dev-student',
  sourceId: 'dev-source',
};
const FAKE_COMPANION_ENV = [
  '# fake values for the test',
  'COMPANION_PORTAL_PROVIDER=canvas',
  'COMPANION_PORTAL_BASE_URL=https://fake-school.example.test',
  `COMPANION_PORTAL_USERNAME=${FAKE_USERNAME}`,
  `COMPANION_PORTAL_PASSWORD=${FAKE_SECRET}`,
].join('\n');

describe('companion dev seed generator', () => {
  const projects: string[] = [];

  /** A throwaway packages/mobile, with a companion.env.local when text is given. */
  function makeProject(companionEnv?: string): string {
    const projectRoot = mkdtempSync(join(tmpdir(), 'companion-dev-seed-'));
    projects.push(projectRoot);
    if (companionEnv !== undefined) {
      writeFileSync(join(projectRoot, COMPANION_ENV_FILE), companionEnv);
    }
    return projectRoot;
  }

  function generatedModule(projectRoot: string): string {
    return readFileSync(join(projectRoot, GENERATED_MODULE), 'utf8');
  }

  afterEach(() => {
    for (const projectRoot of projects.splice(0)) {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  describe('rule 1: only the development server reads companion.env.local', () => {
    it.each(['production', 'test', '', 'Development', undefined])(
      'writes the null module and leaves the file unread when NODE_ENV is %p',
      (nodeEnv) => {
        const projectRoot = makeProject(FAKE_COMPANION_ENV);
        const env: Record<string, string | undefined> = {};

        const outcome = syncCompanionDevSeed({ projectRoot, nodeEnv, env });

        expect(outcome).toBe('skipped');
        expect(generatedModule(projectRoot)).toBe(renderSeedModule(null));
        expect(generatedModule(projectRoot)).not.toContain(FAKE_SECRET);
        expect(generatedModule(projectRoot)).not.toContain(FAKE_USERNAME);
        expect(env).toEqual({});
      }
    );

    it('writes the seed when the bundler is the development server', () => {
      const projectRoot = makeProject(FAKE_COMPANION_ENV);
      const env: Record<string, string | undefined> = {};

      const outcome = syncCompanionDevSeed({ projectRoot, nodeEnv: 'development', env });

      expect(outcome).toBe('seeded');
      expect(generatedModule(projectRoot)).toBe(renderSeedModule(FAKE_SEED));
      expect(env['COMPANION_PORTAL_USERNAME']).toBe(FAKE_USERNAME);
    });

    it('a production run replaces a seed that the development server wrote earlier', () => {
      const projectRoot = makeProject(FAKE_COMPANION_ENV);
      syncCompanionDevSeed({ projectRoot, nodeEnv: 'development', env: {} });
      expect(generatedModule(projectRoot)).toContain(FAKE_SECRET);

      syncCompanionDevSeed({ projectRoot, nodeEnv: 'production', env: {} });

      expect(generatedModule(projectRoot)).toBe(renderSeedModule(null));
    });

    it.each(['development', 'production'])(
      'writes the null module when there is no companion.env.local (NODE_ENV %s)',
      (nodeEnv) => {
        const projectRoot = makeProject();

        expect(syncCompanionDevSeed({ projectRoot, nodeEnv, env: {} })).toBe('none');
        expect(generatedModule(projectRoot)).toBe(renderSeedModule(null));
      }
    );

    it.each([
      [
        'a required field is missing',
        FAKE_COMPANION_ENV.replace(/^COMPANION_PORTAL_USERNAME=.*$/m, ''),
      ],
      ['the provider is not one we support', FAKE_COMPANION_ENV.replace('=canvas', '=blackboard')],
    ])('writes the null module when %s', (_why, companionEnv) => {
      const projectRoot = makeProject(companionEnv);

      const outcome = syncCompanionDevSeed({ projectRoot, nodeEnv: 'development', env: {} });

      expect(outcome).toBe('none');
      expect(generatedModule(projectRoot)).toBe(renderSeedModule(null));
    });
  });

  describe('rule 2: a written seed is only reachable under __DEV__', () => {
    /** The value the generated module exports, in a runtime with the given globals. */
    function exportedSeed(globals: Record<string, unknown>): unknown {
      return runInNewContext(`(${renderSeedExpression(FAKE_SEED)})`, globals);
    }

    it('is the seed in a development bundle', () => {
      expect(exportedSeed({ __DEV__: true })).toEqual(FAKE_SEED);
    });

    it('is null in a production bundle', () => {
      expect(exportedSeed({ __DEV__: false })).toBeNull();
    });

    it('is null where __DEV__ does not exist', () => {
      expect(exportedSeed({})).toBeNull();
    });

    it('puts the values after the __DEV__ check and nowhere else in the module', () => {
      const moduleText = renderSeedModule(FAKE_SEED);
      const guard = "typeof __DEV__ !== 'undefined' && __DEV__ ? ";

      expect(moduleText).toContain(`${guard}${JSON.stringify(FAKE_SEED)} : null;`);
      expect(moduleText.split(FAKE_SECRET)).toHaveLength(2);
      expect(moduleText.indexOf(guard)).toBeLessThan(moduleText.indexOf(FAKE_SECRET));
    });

    it('writes a plain null when there is no seed', () => {
      expect(renderSeedExpression(null)).toBe('null');
      expect(renderSeedModule(null)).not.toContain('__DEV__ ?');
    });
  });
});
