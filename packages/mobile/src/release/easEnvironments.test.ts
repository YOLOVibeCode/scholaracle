import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Each lane (development, preview, production) reads its settings from the EAS environment of
 * the same name.
 *
 * Builds: a profile with no "environment" lets eas-cli pick one from the profile's distribution,
 * and "store" resolves to production. The preview profile is a store build, so without the pin a
 * test build loads production-only settings such as EXPO_PUBLIC_HIDE_DEPLOY_STAMP.
 *
 * Updates: `eas update` takes its settings only from the environment named by --environment. The
 * "env" blocks in eas.json are not read. The channel and the environment must name the same lane,
 * or one lane's phones get the other lane's API address. eas-cli also clears the bundler cache
 * whenever --environment is passed, so a bundle cached with another lane's settings cannot end up
 * in an update while the flag stays. (The scripts in package.json are part of the native
 * fingerprint: editing them makes CI skip preview updates until new preview builds exist.)
 */
type BuildProfile = {
  environment?: string;
  channel?: string;
  env?: { EXPO_PUBLIC_HIDE_DEPLOY_STAMP?: string };
};

type EasJson = {
  build: {
    development: BuildProfile;
    preview: BuildProfile;
    production: BuildProfile;
  };
};

type PackageJson = {
  scripts: {
    'update:preview': string;
    'update:production': string;
  };
};

const PROFILES = ['development', 'preview', 'production'] as const;
const LANES = ['preview', 'production'] as const;

describe('EAS environments per lane', () => {
  const eas = JSON.parse(readFileSync(join(__dirname, '../../eas.json'), 'utf8')) as EasJson;
  const pkg = JSON.parse(
    readFileSync(join(__dirname, '../../package.json'), 'utf8')
  ) as PackageJson;

  it('has exactly the three build profiles this test knows about', () => {
    expect(Object.keys(eas.build).sort()).toEqual([...PROFILES]);
  });

  it.each(PROFILES)('pins the %s build profile to the EAS environment of the same name', (name) => {
    expect(eas.build[name].environment).toBe(name);
  });

  it.each(LANES)('%s builds listen on the channel of the same name', (lane) => {
    expect(eas.build[lane].channel).toBe(lane);
  });

  it('only the production build profile hides the build-stamp footer', () => {
    expect(eas.build.production.env?.EXPO_PUBLIC_HIDE_DEPLOY_STAMP).toBe('1');
    expect(eas.build.preview.env?.EXPO_PUBLIC_HIDE_DEPLOY_STAMP).toBeUndefined();
    expect(eas.build.development.env?.EXPO_PUBLIC_HIDE_DEPLOY_STAMP).toBeUndefined();
  });

  it.each(LANES)(
    'update:%s runs preflight, then publishes to its own channel from its own environment',
    (lane) => {
      const script = pkg.scripts[`update:${lane}`];
      expect(script.startsWith('pnpm preflight && ')).toBe(true);
      expect(/--channel (\S+)/.exec(script)?.[1]).toBe(lane);
      expect(/--environment (\S+)/.exec(script)?.[1]).toBe(lane);
    }
  );
});
