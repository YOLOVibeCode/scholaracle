/**
 * Scraper manifest schema: parse, host matching, run validation.
 */

export interface IScraperManifest {
  readonly id: string;
  readonly name: string;
  readonly adapterId: string;
  readonly version: string;
  readonly scholaracleHelperMinVersion?: string;
  /** Minimum @scholaracle/scraper-core API version this module requires. */
  readonly minCoreVersion?: string;
  /** ISO 8601 timestamp of when this version was published. */
  readonly publishedAt?: string;
  /** Human-readable release notes for the registry UI. */
  readonly changelog?: string;
  readonly hosts: readonly string[];
  readonly entities: readonly string[];
  readonly entry: string;
  readonly bundleHash?: string;
  readonly publisher: 'scholaracle' | 'local';
  readonly permissions?: readonly string[];
  readonly tests?: { readonly fixtureSuite?: string };
}

export type ManifestRunValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: string[] };

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** True when value looks like semver (major.minor.patch[+meta][-pre]). */
export function isSemver(value: string): boolean {
  return SEMVER_RE.test(value.trim());
}

function requireNonEmptyString(obj: Record<string, unknown>, field: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.trim().length === 0) {
    throw new Error(`Invalid scraper manifest: missing or empty "${field}"`);
  }
  return v.trim();
}

function requireStringArray(obj: Record<string, unknown>, field: string): readonly string[] {
  const v = obj[field];
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`Invalid scraper manifest: "${field}" must be a non-empty array`);
  }
  if (!v.every((item) => typeof item === 'string' && item.trim().length > 0)) {
    throw new Error(`Invalid scraper manifest: "${field}" must contain non-empty strings`);
  }
  return v.map((item) => (item as string).trim());
}

/** Parse and validate raw JSON into IScraperManifest. Throws on invalid input. */
export function parseScraperManifest(raw: unknown): IScraperManifest {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid scraper manifest: expected a plain object');
  }
  const obj = raw as Record<string, unknown>;

  const id = requireNonEmptyString(obj, 'id');
  const name = requireNonEmptyString(obj, 'name');
  const adapterId = requireNonEmptyString(obj, 'adapterId');
  const version = requireNonEmptyString(obj, 'version');
  if (!isSemver(version)) {
    throw new Error(`Invalid scraper manifest: "version" must be semver (got "${version}")`);
  }
  const hosts = requireStringArray(obj, 'hosts');
  const entities = requireStringArray(obj, 'entities');
  const entry = requireNonEmptyString(obj, 'entry');

  const publisherRaw = requireNonEmptyString(obj, 'publisher');
  if (publisherRaw !== 'scholaracle' && publisherRaw !== 'local') {
    throw new Error('Invalid scraper manifest: "publisher" must be "scholaracle" or "local"');
  }

  let scholaracleHelperMinVersion: string | undefined;
  if (obj['scholaracleHelperMinVersion'] !== undefined) {
    if (typeof obj['scholaracleHelperMinVersion'] !== 'string') {
      throw new Error('Invalid scraper manifest: "scholaracleHelperMinVersion" must be a string');
    }
    scholaracleHelperMinVersion = obj['scholaracleHelperMinVersion'].trim();
    if (!isSemver(scholaracleHelperMinVersion)) {
      throw new Error(
        `Invalid scraper manifest: "scholaracleHelperMinVersion" must be semver (got "${scholaracleHelperMinVersion}")`
      );
    }
  }

  let minCoreVersion: string | undefined;
  if (obj['minCoreVersion'] !== undefined) {
    if (typeof obj['minCoreVersion'] !== 'string') {
      throw new Error('Invalid scraper manifest: "minCoreVersion" must be a string');
    }
    minCoreVersion = obj['minCoreVersion'].trim();
    if (!isSemver(minCoreVersion)) {
      throw new Error(
        `Invalid scraper manifest: "minCoreVersion" must be semver (got "${minCoreVersion}")`
      );
    }
  }

  let publishedAt: string | undefined;
  if (obj['publishedAt'] !== undefined) {
    if (typeof obj['publishedAt'] !== 'string' || Number.isNaN(Date.parse(obj['publishedAt']))) {
      throw new Error('Invalid scraper manifest: "publishedAt" must be an ISO 8601 timestamp');
    }
    publishedAt = obj['publishedAt'].trim();
  }

  let changelog: string | undefined;
  if (obj['changelog'] !== undefined) {
    if (typeof obj['changelog'] !== 'string') {
      throw new Error('Invalid scraper manifest: "changelog" must be a string');
    }
    changelog = obj['changelog'];
  }

  let bundleHash: string | undefined;
  if (obj['bundleHash'] !== undefined) {
    if (typeof obj['bundleHash'] !== 'string' || obj['bundleHash'].trim().length === 0) {
      throw new Error('Invalid scraper manifest: "bundleHash" must be a non-empty string');
    }
    bundleHash = obj['bundleHash'].trim();
  }

  let permissions: readonly string[] | undefined;
  if (obj['permissions'] !== undefined) {
    if (
      !Array.isArray(obj['permissions']) ||
      !obj['permissions'].every((p) => typeof p === 'string')
    ) {
      throw new Error('Invalid scraper manifest: "permissions" must be a string array');
    }
    permissions = obj['permissions'] as string[];
  }

  let tests: { readonly fixtureSuite?: string } | undefined;
  if (obj['tests'] !== undefined) {
    if (obj['tests'] === null || typeof obj['tests'] !== 'object' || Array.isArray(obj['tests'])) {
      throw new Error('Invalid scraper manifest: "tests" must be an object');
    }
    const t = obj['tests'] as Record<string, unknown>;
    if (t['fixtureSuite'] !== undefined && typeof t['fixtureSuite'] !== 'string') {
      throw new Error('Invalid scraper manifest: "tests.fixtureSuite" must be a string');
    }
    tests = { fixtureSuite: t['fixtureSuite'] as string | undefined };
  }

  return {
    id,
    name,
    adapterId,
    version,
    scholaracleHelperMinVersion,
    minCoreVersion,
    publishedAt,
    changelog,
    hosts,
    entities,
    entry,
    bundleHash,
    publisher: publisherRaw,
    permissions,
    tests,
  };
}

/**
 * Match a URL against host patterns (exact hostname or `*.domain.com`).
 */
export function matchHost(hosts: readonly string[], url: string): boolean {
  if (hosts.length === 0) return false;
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }

  for (const pattern of hosts) {
    const p = pattern.trim().toLowerCase();
    if (!p) continue;
    if (p.startsWith('*.')) {
      const suffix = p.slice(1); // ".domain.com"
      if (hostname.endsWith(suffix) && hostname.length > suffix.length) {
        return true;
      }
    } else if (hostname === p) {
      return true;
    }
  }
  return false;
}

/** Validate a parsed manifest is runnable (non-throwing). */
export function validateManifestForRun(manifest: IScraperManifest): ManifestRunValidation {
  const errors: string[] = [];

  if (!manifest.id?.trim()) errors.push('Missing id');
  if (!manifest.name?.trim()) errors.push('Missing name');
  if (!manifest.adapterId?.trim()) errors.push('Missing adapterId');
  if (!manifest.entry?.trim()) errors.push('Missing or blank entry');
  if (!manifest.hosts || manifest.hosts.length === 0) errors.push('hosts must be non-empty');
  if (!manifest.entities || manifest.entities.length === 0)
    errors.push('entities must be non-empty');
  if (!manifest.version?.trim() || !isSemver(manifest.version)) {
    errors.push('version must be valid semver');
  }
  if (manifest.publisher !== 'scholaracle' && manifest.publisher !== 'local') {
    errors.push('publisher must be "scholaracle" or "local"');
  }
  if (
    manifest.scholaracleHelperMinVersion !== undefined &&
    !isSemver(manifest.scholaracleHelperMinVersion)
  ) {
    errors.push('scholaracleHelperMinVersion must be valid semver');
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
