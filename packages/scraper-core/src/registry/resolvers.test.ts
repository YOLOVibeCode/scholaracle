/**
 * Scraper resolvers — TDD (RED first).
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import { parseScraperManifest } from './manifest';
import type { IScraperModule } from './module';
import {
  BuiltinScraperResolver,
  SideloadScraperResolver,
  CompositeScraperResolver,
} from './resolvers';

const ctx = {
  provider: 'local',
  adapterId: 'com.example.sideload',
  studentExternalId: 'stu-1',
  institutionExternalId: 'inst-1',
};

function makeSideloadModule(overrides: Record<string, unknown> = {}): IScraperModule {
  const metadata = parseScraperManifest({
    id: 'sideload-demo',
    name: 'Sideload Demo',
    adapterId: 'com.example.sideload',
    version: '1.2.3',
    hosts: ['*.example.com'],
    entities: ['course'],
    entry: './index.js',
    publisher: 'local',
    ...overrides,
  });
  return {
    metadata,
    scrape: async () => ({ courses: [] }),
    transform: (_raw, transformCtx): ISlcDeltaOp[] => [
      {
        op: 'upsert',
        entity: 'course',
        key: {
          provider: transformCtx.provider,
          adapterId: transformCtx.adapterId,
          externalId: 'c-1',
        },
        observedAt: '2026-08-04T12:00:00.000Z',
        record: { title: 'Demo' },
      },
    ],
  };
}

describe('BuiltinScraperResolver', () => {
  const resolver = new BuiltinScraperResolver();

  it.each([
    ['canvas', 'com.instructure.canvas'],
    ['com.instructure.canvas', 'com.instructure.canvas'],
    ['skyward', 'com.skyward.qmlativ'],
    ['com.skyward.qmlativ', 'com.skyward.qmlativ'],
    ['com.skyward.iscorp', 'com.skyward.qmlativ'],
    ['aeries', 'com.aeries.sis'],
    ['com.aeries.sis', 'com.aeries.sis'],
    ['com.aeries.portal', 'com.aeries.sis'],
  ] as const)('resolves %s → adapterId %s', async (key, adapterId) => {
    const result = await resolver.resolve(key);
    expect(result.module.metadata.adapterId).toBe(adapterId);
    expect(result.canRun).toBe(true);
    expect(result.checkErrors).toEqual([]);
    expect(typeof result.module.scrape).toBe('function');
    expect(typeof result.module.transform).toBe('function');
  });

  it('throws for unknown adapter', async () => {
    await expect(resolver.resolve('com.unknown.platform')).rejects.toThrow(/unknown|not found/i);
  });

  it('rejects version mismatch', async () => {
    await expect(resolver.resolve('canvas', '9.9.9')).rejects.toThrow(/version/i);
  });

  it('canvas transform produces ops from extract-shaped raw', async () => {
    const result = await resolver.resolve('canvas');
    const ops = result.module.transform(
      {
        user: 'Emma',
        courses: [],
        toDoItems: [],
        upcomingEvents: [],
        announcements: [],
        timestamp: '2026-08-04T12:00:00.000Z',
      },
      { ...ctx, provider: 'canvas', adapterId: 'com.instructure.canvas' }
    );
    expect(Array.isArray(ops)).toBe(true);
  });
});

describe('SideloadScraperResolver', () => {
  it('register + list + resolve by adapterId', async () => {
    const sideload = new SideloadScraperResolver();
    const mod = makeSideloadModule();
    sideload.register(mod);

    expect(sideload.list()).toHaveLength(1);
    expect(sideload.list()[0]!.metadata.adapterId).toBe('com.example.sideload');

    const result = await sideload.resolve('com.example.sideload');
    expect(result.module).toBe(mod);
    expect(result.canRun).toBe(true);
    expect(result.checkErrors).toEqual([]);
  });

  it('resolves by version when provided', async () => {
    const sideload = new SideloadScraperResolver();
    sideload.register(makeSideloadModule({ version: '1.0.0' }));
    sideload.register(makeSideloadModule({ version: '2.0.0', id: 'sideload-v2' }));

    const result = await sideload.resolve('com.example.sideload', '2.0.0');
    expect(result.module.metadata.version).toBe('2.0.0');
  });

  it('throws when adapter not registered', async () => {
    const sideload = new SideloadScraperResolver();
    await expect(sideload.resolve('com.missing')).rejects.toThrow(/not found|unknown/i);
  });

  it('returns canRun false when module fails checks', async () => {
    const sideload = new SideloadScraperResolver();
    const mod = makeSideloadModule();
    const broken: IScraperModule = {
      ...mod,
      scrape: undefined as unknown as IScraperModule['scrape'],
    };
    sideload.register(broken);

    const result = await sideload.resolve('com.example.sideload');
    expect(result.canRun).toBe(false);
    expect(result.checkErrors.length).toBeGreaterThan(0);
  });
});

describe('CompositeScraperResolver', () => {
  it('prefers sideload over builtin', async () => {
    const sideload = new SideloadScraperResolver();
    const override = makeSideloadModule({
      adapterId: 'com.instructure.canvas',
      id: 'local-canvas',
      name: 'Local Canvas Override',
      version: '99.0.0',
    });
    sideload.register(override);

    const composite = new CompositeScraperResolver(sideload, new BuiltinScraperResolver());
    const result = await composite.resolve('com.instructure.canvas');
    expect(result.module.metadata.publisher).toBe('local');
    expect(result.module.metadata.version).toBe('99.0.0');
  });

  it('falls back to builtin when sideload misses', async () => {
    const composite = new CompositeScraperResolver(
      new SideloadScraperResolver(),
      new BuiltinScraperResolver()
    );
    const result = await composite.resolve('skyward');
    expect(result.module.metadata.adapterId).toBe('com.skyward.qmlativ');
    expect(result.canRun).toBe(true);
  });

  it('throws when neither resolver has the adapter', async () => {
    const composite = new CompositeScraperResolver(
      new SideloadScraperResolver(),
      new BuiltinScraperResolver()
    );
    await expect(composite.resolve('com.totally.missing')).rejects.toThrow(/not found|unknown/i);
  });
});
