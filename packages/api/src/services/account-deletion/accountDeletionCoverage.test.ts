import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  COLLECTIONS_HANDLED_BY_DELETION_SERVICE,
  COLLECTIONS_KEPT_ON_ACCOUNT_DELETION,
  STUDENT_SCOPED_DELETION_COLLECTIONS,
  USER_ID_KEYED_DELETION_COLLECTIONS,
  USER_SCOPED_DELETION_TARGETS,
} from '@scholaracle/database';

/**
 * Account deletion promises to remove the household's data. A new collection that nobody adds
 * to the deletion lists breaks that promise without failing any test, which is how eighteen
 * collections came to be left behind. This test reads the source for collection names and
 * fails when one is neither deleted with the account nor listed as kept, with a reason.
 */

const PACKAGES_DIR = resolve(__dirname, '../../../..');

/** Packages that talk to the database. Elsewhere `slc_…` strings are keys in device storage. */
const SERVER_PACKAGES = ['api', 'agents', 'workers', 'database', 'auth'];

const COLLECTION_CALL = /\.collection(?:<[^(]*>)?\(\s*['"]([A-Za-z0-9_]+)['"]/g;
const COLLECTION_CONSTANT = /\b[A-Z0-9_]*COLLECTION[A-Z0-9_]*\s*=\s*['"]([a-z0-9_]+)['"]/g;
const SLC_NAME = /['"](slc_[a-z0-9_]+)['"]/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        out.push(...sourceFiles(full));
      }
    } else if (
      entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.d.ts') &&
      !entry.name.includes('.test.')
    ) {
      out.push(full);
    }
  }
  return out;
}

/** The collection names one file mentions. */
function namesIn(text: string): string[] {
  return [COLLECTION_CALL, COLLECTION_CONSTANT, SLC_NAME].flatMap((pattern) =>
    [...text.matchAll(pattern)]
      .map((match) => match[1])
      .filter((name): name is string => name !== undefined)
  );
}

/** Collection name → one file that names it. */
function collectionsNamedInSource(): Map<string, string> {
  const found = new Map<string, string>();
  const files = SERVER_PACKAGES.flatMap((pkg) => sourceFiles(join(PACKAGES_DIR, pkg, 'src')));
  for (const file of files) {
    for (const name of namesIn(readFileSync(file, 'utf8'))) {
      if (!found.has(name)) {
        found.set(name, relative(PACKAGES_DIR, file));
      }
    }
  }
  return found;
}

const DELETED = new Set<string>([
  ...USER_SCOPED_DELETION_TARGETS.map((target) => target.name),
  ...STUDENT_SCOPED_DELETION_COLLECTIONS,
  ...USER_ID_KEYED_DELETION_COLLECTIONS,
  ...COLLECTIONS_HANDLED_BY_DELETION_SERVICE,
]);
const KEPT = new Set<string>(Object.keys(COLLECTIONS_KEPT_ON_ACCOUNT_DELETION));

describe('account deletion covers every collection the server names', () => {
  const named = collectionsNamedInSource();

  it('finds the collections in the source', () => {
    // Guards the scan itself: a pattern that stops matching would pass everything.
    expect(named.size).toBeGreaterThan(60);
    for (const name of ['users', 'slc_assignments', 'slc_student_profiles', 'guidance_sends']) {
      expect(named.has(name)).toBe(true);
    }
  });

  it('deletes each one with the account, or lists it as kept with a reason', () => {
    const undecided = [...named.entries()]
      .filter(([name]) => !DELETED.has(name) && !KEPT.has(name))
      .map(([name, file]) => `${name} (${file})`);

    // To fix: add the collection to a list in
    // packages/database/src/accountDeletion/accountDeletionCollections.ts.
    expect(undecided).toEqual([]);
  });

  it('gives a reason for each collection it keeps', () => {
    for (const [name, reason] of Object.entries(COLLECTIONS_KEPT_ON_ACCOUNT_DELETION)) {
      expect({ name, hasReason: reason.trim().length >= 10 }).toEqual({ name, hasReason: true });
    }
  });

  it('never both deletes and keeps a collection', () => {
    expect([...KEPT].filter((name) => DELETED.has(name))).toEqual([]);
  });

  it('lists no collection the server no longer names', () => {
    // A stale entry hides nothing, but it reads as if the data still existed.
    const stale = [...DELETED, ...KEPT].filter((name) => !named.has(name));
    expect(stale).toEqual([]);
  });
});
