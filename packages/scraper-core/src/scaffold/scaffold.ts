/**
 * Scaffold a community IScraperModule (manifest + scrape/transform + FakePageDriver harness).
 * Default output: packages/scraper-core/src/community/<slug>/
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface IScaffoldScraperOptions {
  readonly name: string;
  readonly hosts: readonly string[];
  /** Defaults to studentProfile, course, assignment, gradeSnapshot */
  readonly entities?: readonly string[];
  /** Parent directory; creates <parent>/<slug>/ */
  readonly outDir: string;
  readonly adapterId?: string;
  readonly version?: string;
}

export interface IScaffoldScraperResult {
  readonly slug: string;
  readonly dir: string;
  readonly files: readonly string[];
}

const DEFAULT_ENTITIES = ['studentProfile', 'course', 'assignment', 'gradeSnapshot'] as const;

/** Slug for directory / adapter id segments. */
export function slugifyPlatformName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pascal(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
}

function camel(slug: string): string {
  const p = pascal(slug);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function requireHosts(hosts: readonly string[]): readonly string[] {
  if (!hosts.length || hosts.some((h) => !h.trim())) {
    throw new Error('scaffold requires at least one non-empty host pattern');
  }
  return hosts.map((h) => h.trim());
}

function renderManifest(opts: {
  readonly slug: string;
  readonly name: string;
  readonly adapterId: string;
  readonly version: string;
  readonly hosts: readonly string[];
  readonly entities: readonly string[];
}): string {
  return `${JSON.stringify(
    {
      id: opts.slug,
      name: opts.name,
      adapterId: opts.adapterId,
      version: opts.version,
      minCoreVersion: '0.1.0',
      publishedAt: new Date().toISOString(),
      changelog: `Scaffolded ${opts.name} scraper (${opts.entities.join(', ')})`,
      hosts: opts.hosts,
      entities: opts.entities,
      entry: './index.ts',
      publisher: 'local',
      tests: { fixtureSuite: 'sample' },
    },
    null,
    2
  )}\n`;
}

function renderTransform(slug: string, entities: readonly string[]): string {
  const P = pascal(slug);
  const wantsCourse = entities.includes('course');
  const wantsAssignment = entities.includes('assignment');
  const wantsGrade = entities.includes('gradeSnapshot');
  const wantsProfile = entities.includes('studentProfile');
  const wantsMessage = entities.includes('message');

  return `/**
 * ${slug} transformer — raw extract → ISlcDeltaOp[].
 * Entities: ${entities.join(', ')}
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { ITransformContext } from '../../types';

export interface I${P}Extract {
  readonly studentName?: string;
  readonly courses?: ReadonlyArray<{
    readonly id: string;
    readonly title: string;
    readonly grade?: string;
    readonly teacher?: string;
    readonly assignments?: ReadonlyArray<{
      readonly id: string;
      readonly title: string;
      readonly dueDate?: string;
      readonly status?: string;
      readonly points?: string;
    }>;
  }>;
  readonly messages?: ReadonlyArray<{
    readonly id: string;
    readonly subject: string;
    readonly body: string;
    readonly senderName: string;
    readonly sentAt: string;
  }>;
  readonly scrapedAt: string;
}

export function transform${P}Extract(
  extract: I${P}Extract,
  ctx: ITransformContext,
): ISlcDeltaOp[] {
  const ops: ISlcDeltaOp[] = [];
  const observedAt = extract.scrapedAt || new Date().toISOString();
  const baseKey = {
    provider: ctx.provider,
    adapterId: ctx.adapterId,
  };

${
  wantsProfile
    ? `  if (extract.studentName?.trim()) {
    ops.push({
      op: 'upsert',
      entity: 'studentProfile',
      key: { ...baseKey, externalId: ctx.studentExternalId },
      observedAt,
      record: { name: extract.studentName.trim() },
    });
  }

`
    : ''
}${
    wantsCourse || wantsAssignment || wantsGrade
      ? `  for (const course of extract.courses ?? []) {
${
  wantsCourse
    ? `    ops.push({
      op: 'upsert',
      entity: 'course',
      key: { ...baseKey, externalId: course.id },
      observedAt,
      record: {
        title: course.title,
        teacherName: course.teacher,
      },
    });

`
    : ''
}${
          wantsGrade
            ? `    if (course.grade) {
      ops.push({
        op: 'upsert',
        entity: 'gradeSnapshot',
        key: { ...baseKey, externalId: \`\${course.id}-grade\` },
        observedAt,
        record: {
          courseExternalId: course.id,
          asOfDate: observedAt.slice(0, 10),
          percentGrade: Number.parseFloat(course.grade) || undefined,
          displayGrade: course.grade,
        },
      });
    }

`
            : ''
        }${
          wantsAssignment
            ? `    for (const a of course.assignments ?? []) {
      ops.push({
        op: 'upsert',
        entity: 'assignment',
        key: { ...baseKey, externalId: a.id },
        observedAt,
        record: {
          title: a.title,
          courseExternalId: course.id,
          dueDate: a.dueDate,
          status: a.status,
        },
      });
    }

`
            : ''
        }  }

`
      : ''
  }${
    wantsMessage
      ? `  for (const m of extract.messages ?? []) {
    ops.push({
      op: 'upsert',
      entity: 'message',
      key: { ...baseKey, externalId: m.id },
      observedAt,
      record: {
        subject: m.subject,
        body: m.body,
        senderName: m.senderName,
        sentAt: m.sentAt,
      },
    });
  }

`
      : ''
  }  return ops;
}
`;
}

function renderIndex(slug: string, name: string): string {
  const P = pascal(slug);
  const mod = camel(slug);
  return `/**
 * ${name} — community scraper module (IScraperModule).
 *
 * 1. Implement scrape() with host.driver (WebView / extension / FakePageDriver)
 * 2. Map raw → ops in transform.ts
 * 3. Update fixtures/sample.json and run: pnpm test -- ${slug}
 * 4. Sideload via Helper when ready
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { ITransformContext } from '../../types';
import { parseScraperManifest } from '../../registry/manifest';
import type { IScraperHost, IScraperModule } from '../../registry/module';
import { transform${P}Extract, type I${P}Extract } from './transform';

const metadata = parseScraperManifest(
  JSON.parse(readFileSync(join(__dirname, 'manifest.json'), 'utf8')),
);

export const ${mod}Module: IScraperModule = {
  metadata,
  async scrape(host: IScraperHost): Promise<Record<string, unknown>> {
    host.progress({
      phase: 'scraping',
      message: 'Scraping ${name}',
      timestamp: new Date().toISOString(),
    });

    await host.driver.goto(host.config.baseUrl);
    await host.driver.waitForLoad({ timeout: 15000 }).catch(() => undefined);

    // TODO: login + navigate + evaluate selectors for your portal
    const extract: I${P}Extract = {
      studentName: host.config.studentNameHint ?? 'Unknown Student',
      courses: [],
      scrapedAt: new Date().toISOString(),
    };
    return extract as unknown as Record<string, unknown>;
  },
  transform(raw: Record<string, unknown>, ctx: ITransformContext): ISlcDeltaOp[] {
    return transform${P}Extract(raw as unknown as I${P}Extract, ctx);
  },
};
`;
}

function renderFixture(name: string): string {
  return `${JSON.stringify(
    {
      studentName: 'Sample Student',
      courses: [
        {
          id: 'course-1',
          title: `${name} Homeroom`,
          grade: '95%',
          teacher: 'Ms. Example',
          assignments: [
            {
              id: 'asg-1',
              title: 'Welcome Quiz',
              dueDate: '2026-09-01T23:59:00.000Z',
              status: 'graded',
              points: '10',
            },
          ],
        },
      ],
      messages: [],
      scrapedAt: '2026-08-04T12:00:00.000Z',
    },
    null,
    2
  )}\n`;
}

function renderTest(slug: string, name: string): string {
  const P = pascal(slug);
  const mod = camel(slug);
  return `/**
 * Harness: FakePageDriver → transform → validateEnvelope for ${name}.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { FakePageDriver } from '../../driver/FakePageDriver';
import { validateEnvelope } from '../../validator/validator';
import { checkScraperModule } from '../../registry/check-module';
import { ${mod}Module } from './index';
import { transform${P}Extract, type I${P}Extract } from './transform';

const ctx = {
  provider: '${slug}',
  adapterId: ${mod}Module.metadata.adapterId,
  studentExternalId: 'stu-sample',
  institutionExternalId: 'inst-sample',
};

describe('${name} community scraper harness', () => {
  it('should pass structural checkScraperModule', async () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'sample.json'), 'utf8'),
    ) as I${P}Extract;

    const errors = await checkScraperModule(${mod}Module, {
      runFixtures: true,
      fixtures: {
        'https://portal.example.com': {
          html: '<html><body>ok</body></html>',
        },
      },
      config: { baseUrl: 'https://portal.example.com', studentNameHint: fixture.studentName },
      transformContext: ctx,
      driver: new FakePageDriver({
        initialUrl: 'https://portal.example.com',
        fixtures: {
          'https://portal.example.com': { html: '<html><body>ok</body></html>' },
        },
      }),
    });

    expect(errors.filter((e) => /missing scrape|missing transform|manifest/i.test(e))).toEqual([]);
  });

  it('should transform sample fixture into a valid envelope', () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, 'fixtures', 'sample.json'), 'utf8'),
    ) as I${P}Extract;
    const ops = transform${P}Extract(fixture, ctx);
    expect(ops.length).toBeGreaterThan(0);

    const envelope = {
      schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
      run: {
        runId: 'harness-run-1',
        startedAt: fixture.scrapedAt,
        endedAt: fixture.scrapedAt,
        provider: ctx.provider,
        adapterId: ctx.adapterId,
        adapterVersion: ${mod}Module.metadata.version,
        mode: 'delta' as const,
        timezone: 'UTC',
      },
      source: {
        sourceId: 'src-harness',
        displayName: '${name}',
        portalBaseUrl: 'https://portal.example.com',
      },
      ops,
    };

    const report = validateEnvelope(envelope);
    expect(report.passed).toBe(true);
    expect(report.errorCount).toBe(0);
  });
});
`;
}

function renderReadme(name: string, slug: string, entities: readonly string[]): string {
  return `# ${name} scraper

Community / sideload scraper scaffold for Scholaracle Helper.

## Entities

${entities.map((e) => `- \`${e}\``).join('\n')}

## Workflow

1. Edit \`index.ts\` \`scrape()\` — use \`host.driver\` (\`goto\` / \`evaluate\` / \`wait\`).
2. Adjust \`transform.ts\` if your raw JSON shape differs.
3. Update \`fixtures/sample.json\` with a realistic extract.
4. Run harness:

\`\`\`bash
cd packages/scraper-core
pnpm test -- ${slug}
\`\`\`

5. When green, sideload in Helper or register with \`CompositeScraperResolver\`.

See repo \`docs/DATA_EXTRACTION_CHECKLIST.md\` for every field to chase on the portal.
`;
}

/** Write a new community scraper under outDir/<slug>/. */
export function scaffoldScraperModule(options: IScaffoldScraperOptions): IScaffoldScraperResult {
  const name = options.name.trim();
  if (!name) throw new Error('scaffold requires a non-empty name');

  const slug = slugifyPlatformName(name);
  if (!slug) throw new Error('scaffold name produced an empty slug');

  const hosts = requireHosts(options.hosts);
  const entities = [...(options.entities?.length ? options.entities : DEFAULT_ENTITIES)];
  const version = options.version ?? '0.1.0';
  const adapterId = options.adapterId ?? `com.local.${slug}`;
  const dir = join(options.outDir, slug);

  if (existsSync(dir)) {
    throw new Error(`Scaffold target already exists: ${dir}`);
  }

  mkdirSync(join(dir, 'fixtures'), { recursive: true });

  const files = [
    'manifest.json',
    'index.ts',
    'transform.ts',
    'fixtures/sample.json',
    'index.test.ts',
    'README.md',
  ] as const;

  writeFileSync(
    join(dir, 'manifest.json'),
    renderManifest({ slug, name, adapterId, version, hosts, entities })
  );
  writeFileSync(join(dir, 'transform.ts'), renderTransform(slug, entities));
  writeFileSync(join(dir, 'index.ts'), renderIndex(slug, name));
  writeFileSync(join(dir, 'fixtures', 'sample.json'), renderFixture(name));
  writeFileSync(join(dir, 'index.test.ts'), renderTest(slug, name));
  writeFileSync(join(dir, 'README.md'), renderReadme(name, slug, entities));

  return { slug, dir, files: [...files] };
}
