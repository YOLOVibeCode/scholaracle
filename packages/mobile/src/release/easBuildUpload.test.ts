import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { devNull } from 'os';
import { join } from 'path';

/**
 * What `eas build` uploads to Expo from a developer machine.
 *
 * eas-cli uploads the working folder, not the commit. It leaves out what the .gitignore files
 * leave out, unless the repository root has an .easignore: then it reads only that file ("if
 * .easignore exists, .gitignore files are not used", eas-cli build/vcs/local.js).
 *
 * An .easignore that lists only caches therefore makes a build from a developer machine upload
 * that machine's gitignored files too: .env files, .demo-credentials, agent worktrees and old
 * build output, gigabytes of it. This repository had such a file.
 *
 * With no .easignore a build uploads what git would commit (about 13 MB). The .gitignore files then
 * decide two things, and both are held here:
 *   - a local file with secrets must be ignored, or it is uploaded;
 *   - a tracked file must not match an ignore rule, or eas-cli leaves it out of the build even
 *     though git still tracks it.
 *
 * To keep a file out of a build, ignore it in .gitignore. Do not add an .easignore.
 *
 * The checks ask git, and eas-cli is stricter than git in one case: a `!` exception in a nested
 * .gitignore does not bring back a file that a parent .gitignore ignores.
 */

const REPO_ROOT = join(__dirname, '../../../..');

/** Runs git in the repository root without the machine's own global ignore file. */
function git(args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync('git', ['-c', `core.excludesFile=${devNull}`, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout ?? '' };
}

function isIgnored(path: string): boolean {
  const { status } = git(['check-ignore', '--no-index', '-q', '--', path]);
  if (status !== 0 && status !== 1) {
    throw new Error(`git check-ignore failed for ${path} (exit ${String(status)})`);
  }
  return status === 0;
}

/** Local files that must never be uploaded, each with what it holds. */
const NEVER_UPLOADED: ReadonlyArray<readonly [path: string, holds: string]> = [
  ['.env', 'server keys (email, texting, payments, AI, token signing)'],
  ['.env.local', 'server keys'],
  ['packages/web/.env.local', 'the feedback widget token'],
  ['packages/mobile/.env', 'local app settings'],
  ['packages/mobile/companion.env.local', "a developer's own school-portal sign-in"],
  ['packages/mobile/src/credentials/companionDevSeed.generated.ts', 'the module written from it'],
  ['.demo-credentials', "the store reviewers' demo sign-in"],
  ['AuthKey_ABCDE12345.p8', 'an App Store Connect API key'],
  ['play-service-account.json', 'a Google Play API key'],
  ['.claude/settings.local.json', "an agent's per-machine settings"],
  ['.claude/worktrees/agent-1/packages/mobile/App.tsx', 'agent worktrees'],
  ['packages/mobile/build/e2e-ios/Build/Products/main.jsbundle', 'local build output'],
  ['packages/e2e/test-results/trace.zip', 'recordings of signed-in browser tests'],
  // An uploaded native folder makes EAS skip prebuild and compile that stale copy instead.
  ['packages/mobile/ios/Podfile', 'the generated iOS project'],
  ['packages/mobile/android/build.gradle', 'the generated Android project'],
];

/**
 * Tracked files that match an ignore rule: eas-cli does not upload them. Neither is read by a
 * build. Before adding a file here, make sure no build needs it.
 */
const TRACKED_BUT_NOT_UPLOADED = [
  'packages/connector/.env.canvas.example',
  'packages/e2e/.env.scraper-e2e.example',
];

const inGitCheckout = git(['rev-parse', '--is-inside-work-tree']).stdout.trim() === 'true';
// Outside a git checkout (a source archive) there is nothing to ask. CI always has one, so there
// the checks run and fail loudly if git cannot answer, instead of being skipped unnoticed.
const describeInGit = inGitCheckout || process.env['CI'] ? describe : describe.skip;

describe('EAS build upload', () => {
  it('has no .easignore in the repository root', () => {
    expect(existsSync(join(REPO_ROOT, '.easignore'))).toBe(false);
  });
});

describeInGit('EAS build upload: what the .gitignore files decide', () => {
  it.each(NEVER_UPLOADED)('leaves out %s (%s)', (path) => {
    expect(isIgnored(path)).toBe(true);
  });

  it.each([
    'package.json',
    'pnpm-lock.yaml',
    'packages/mobile/app.json',
    'packages/mobile/metro.config.js',
    'packages/mobile/scripts/companion-dev-seed.js',
    'packages/mobile/src/credentials/devCredentialSeed.ts',
    'packages/contracts/src/index.ts',
  ])('uploads %s', (path) => {
    expect(isIgnored(path)).toBe(false);
  });

  it('uploads every tracked file, apart from the known list', () => {
    const { status, stdout } = git(['ls-files', '--cached', '--ignored', '--exclude-standard']);
    expect(status).toBe(0);

    const trackedButIgnored = stdout.split('\n').filter((line) => line !== '');
    expect(trackedButIgnored.filter((file) => !TRACKED_BUT_NOT_UPLOADED.includes(file))).toEqual(
      []
    );
  });
});
