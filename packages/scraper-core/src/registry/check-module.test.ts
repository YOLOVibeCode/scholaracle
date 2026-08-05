/**
 * checkScraperModule — TDD (RED first).
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import { FakePageDriver } from '../driver/FakePageDriver';
import type { ITransformContext } from '../types';
import { parseScraperManifest } from './manifest';
import { checkScraperModule } from './check-module';
import type { IScraperHost, IScraperModule } from './module';

const ctx: ITransformContext = {
  provider: 'canvas',
  adapterId: 'com.instructure.canvas',
  studentExternalId: 'stu-1',
  institutionExternalId: 'inst-1',
};

function makeManifest(overrides: Record<string, unknown> = {}) {
  return parseScraperManifest({
    id: 'local-test',
    name: 'Local Test',
    adapterId: 'com.example.test',
    version: '0.1.0',
    hosts: ['*.example.com'],
    entities: ['course', 'assignment'],
    entry: './index.js',
    publisher: 'local',
    ...overrides,
  });
}

function makeModule(overrides: Partial<IScraperModule> = {}): IScraperModule {
  const metadata = overrides.metadata ?? makeManifest();
  return {
    metadata,
    scrape: overrides.scrape ?? (async () => ({ ok: true })),
    transform:
      overrides.transform ??
      ((_raw, transformCtx): ISlcDeltaOp[] => [
        {
          op: 'upsert',
          entity: 'course',
          key: {
            provider: transformCtx.provider,
            adapterId: transformCtx.adapterId,
            externalId: 'c-1',
          },
          observedAt: '2026-08-04T12:00:00.000Z',
          record: { title: 'Math' },
        },
      ]),
  };
}

describe('checkScraperModule', () => {
  it('returns no errors for a valid module', async () => {
    const errors = await checkScraperModule(makeModule());
    expect(errors).toEqual([]);
  });

  it('reports missing scrape', async () => {
    const mod = makeModule();
    const broken = { ...mod, scrape: undefined as unknown as IScraperModule['scrape'] };
    const errors = await checkScraperModule(broken);
    expect(errors.some((e) => /scrape/i.test(e))).toBe(true);
  });

  it('reports missing transform', async () => {
    const mod = makeModule();
    const broken = { ...mod, transform: undefined as unknown as IScraperModule['transform'] };
    const errors = await checkScraperModule(broken);
    expect(errors.some((e) => /transform/i.test(e))).toBe(true);
  });

  it('reports invalid manifest', async () => {
    const mod = makeModule({
      metadata: { ...makeManifest(), adapterId: '', hosts: [] },
    });
    const errors = await checkScraperModule(mod);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => /adapterId|hosts/i.test(e))).toBe(true);
  });

  it('reports bundle hash mismatch when expectedBundleHash differs', async () => {
    const mod = makeModule({
      metadata: makeManifest({ bundleHash: 'sha256:good' }),
    });
    const errors = await checkScraperModule(mod, { expectedBundleHash: 'sha256:bad' });
    expect(errors.some((e) => /bundleHash|hash/i.test(e))).toBe(true);
  });

  it('passes bundle hash when expectedBundleHash matches', async () => {
    const mod = makeModule({
      metadata: makeManifest({ bundleHash: 'sha256:good' }),
    });
    const errors = await checkScraperModule(mod, { expectedBundleHash: 'sha256:good' });
    expect(errors.some((e) => /bundleHash|hash/i.test(e))).toBe(false);
  });

  it('reports missing fixture suite when declared but runFixtures without fixtures', async () => {
    const mod = makeModule({
      metadata: makeManifest({ tests: { fixtureSuite: 'suite-a' } }),
    });
    const errors = await checkScraperModule(mod, { runFixtures: true });
    expect(errors.some((e) => /fixture/i.test(e))).toBe(true);
  });

  it('runs scrape+transform+validateEnvelope with FakePageDriver fixtures', async () => {
    const mod = makeModule({
      scrape: async (host: IScraperHost) => {
        await host.driver.goto(host.config.baseUrl);
        const title = await host.driver.evaluate(() => 'Math');
        return { title };
      },
      transform: (raw, transformCtx): ISlcDeltaOp[] => [
        {
          op: 'upsert',
          entity: 'course',
          key: {
            provider: transformCtx.provider,
            adapterId: transformCtx.adapterId,
            externalId: 'c-math',
          },
          observedAt: '2026-08-04T12:00:00.000Z',
          record: { title: String((raw as { title: string }).title) },
        },
      ],
    });

    const errors = await checkScraperModule(mod, {
      runFixtures: true,
      fixtures: {
        'https://school.example.com': {
          evaluateResults: ['Math'],
        },
      },
      config: { baseUrl: 'https://school.example.com' },
      transformContext: ctx,
    });
    expect(errors).toEqual([]);
  });

  it('reports envelope validation errors from bad transform output', async () => {
    const mod = makeModule({
      scrape: async () => ({}),
      transform: (): ISlcDeltaOp[] => [
        {
          op: 'upsert',
          entity: 'course',
          key: {
            provider: 'canvas',
            adapterId: 'com.instructure.canvas',
            externalId: 'c-1',
          },
          observedAt: '2026-08-04T12:00:00.000Z',
          record: {}, // missing title
        },
      ],
    });

    const errors = await checkScraperModule(mod, {
      runFixtures: true,
      fixtures: { 'https://school.example.com': {} },
      config: { baseUrl: 'https://school.example.com' },
      transformContext: ctx,
      driver: new FakePageDriver({ initialUrl: 'https://school.example.com' }),
    });
    expect(errors.some((e) => /title|envelope|valid/i.test(e))).toBe(true);
  });

  it('accepts an injected FakePageDriver instance', async () => {
    const driver = new FakePageDriver({
      initialUrl: 'https://school.example.com',
      fixtures: {
        'https://school.example.com': { evaluateResults: ['ok'] },
      },
    });
    const mod = makeModule({
      scrape: async (host) => {
        const v = await host.driver.evaluate(() => 'x');
        return { v };
      },
    });
    const errors = await checkScraperModule(mod, {
      runFixtures: true,
      driver,
      config: { baseUrl: 'https://school.example.com' },
      transformContext: ctx,
    });
    expect(errors).toEqual([]);
  });
});
