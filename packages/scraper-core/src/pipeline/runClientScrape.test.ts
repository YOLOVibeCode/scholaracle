/**
 * Pipeline tests for fail-open enrichment. Uses a stub IScraperResolver so
 * recipes never run (ISP: host may inject a resolver).
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import { FakePageDriver } from '../driver/FakePageDriver';
import type { IScraperModule, IScraperResolver } from '../registry/module';
import type { IAIEnricher, IClientScrapeHost, IIngestUploader } from './types';
import { runClientScrape } from './runClientScrape';

const NOW = '2026-01-15T10:00:00.000Z';

function op(
  entity: ISlcDeltaOp['entity'],
  externalId: string,
  record: Record<string, unknown>
): ISlcDeltaOp {
  return {
    op: 'upsert',
    entity,
    key: {
      provider: 'skyward',
      adapterId: 'com.skyward.grade',
      studentExternalId: 'stu-1',
      institutionExternalId: 'inst-1',
      externalId,
    },
    observedAt: NOW,
    record,
  };
}

const COURSE = op('course', 'skyward-course-A1', {
  title: 'ALGEBRA 1',
  period: '1',
  teacherName: 'Smith',
});
const ATTENDANCE_GAP = op('attendanceEvent', 'att-1', {
  date: '2026-01-10',
  status: 'present',
  periodName: '1',
});

function stubResolver(ops: ISlcDeltaOp[]): IScraperResolver {
  const module: IScraperModule = {
    metadata: {
      id: 'skyward',
      name: 'Skyward',
      adapterId: 'com.skyward.grade',
      version: '0.1.0',
      hosts: ['*.skyward.com'],
      entities: ['course', 'attendanceEvent'],
      entry: 'builtin:skyward',
      publisher: 'scholaracle',
    },
    scrape: async () => ({ student: 'Emma', courses: [], timestamp: NOW }),
    transform: () => ops,
  };
  return {
    async resolve() {
      return { module, canRun: true, checkErrors: [] };
    },
  };
}

function makeHost(
  ops: ISlcDeltaOp[],
  extra: Partial<IClientScrapeHost> = {}
): { host: IClientScrapeHost; uploaded: ISlcDeltaOp[][]; progress: string[] } {
  const uploaded: ISlcDeltaOp[][] = [];
  const progress: string[] = [];
  const uploader: IIngestUploader = {
    async upload(envelope) {
      uploaded.push([...envelope.ops]);
    },
  };
  const host: IClientScrapeHost = {
    driver: new FakePageDriver(),
    config: {
      provider: 'skyward',
      adapterId: 'com.skyward.grade',
      adapterVersion: 'test@1.0.0',
      baseUrl: 'https://school.skyward.com',
      sourceId: 'src-1',
      studentExternalId: 'stu-1',
      institutionExternalId: 'inst-1',
    },
    clientType: 'mobile',
    uploader,
    resolver: stubResolver(ops),
    onProgress: (p) => progress.push(`${p.phase}:${p.message}`),
    ...extra,
  };
  return { host, uploaded, progress };
}

describe('runClientScrape enrichment', () => {
  it('applies JoinGapEnricher by default so mobile needs no extra argument', async () => {
    const { host, uploaded } = makeHost([COURSE, ATTENDANCE_GAP]);
    const envelope = await runClientScrape(host);
    expect(envelope.ops[1]?.record?.['courseExternalId']).toBe('skyward-course-A1');
    expect(uploaded[0]?.[1]?.record?.['courseExternalId']).toBe('skyward-course-A1');
    expect(envelope.run.meta?.['enrichmentSource']).toMatch(/join-gap/);
    expect(Number(envelope.run.meta?.['enrichmentPatchCount'])).toBeGreaterThan(0);
  });

  it('still uploads original ops when the host enricher throws', async () => {
    const boom: IAIEnricher = {
      async enrich() {
        throw new Error('llm 500');
      },
    };
    const { host } = makeHost([COURSE, ATTENDANCE_GAP], { enricher: boom });
    const envelope = await runClientScrape(host);
    // JoinGap ran first; host failure must not roll that back or fail the sync
    expect(envelope.ops[1]?.record?.['courseExternalId']).toBe('skyward-course-A1');
    expect(envelope.run.meta?.['enrichmentFailed']).toBe('true');
  });

  it('does not throw SyncError when the host enricher hangs past timeout', async () => {
    const hung: IAIEnricher = {
      enrich: () => new Promise(() => undefined),
    };
    const { host } = makeHost([COURSE, ATTENDANCE_GAP], {
      enricher: hung,
      enricherTimeoutMs: 20,
    });
    const envelope = await runClientScrape(host);
    expect(envelope.ops[1]?.record?.['courseExternalId']).toBe('skyward-course-A1');
    expect(envelope.run.meta?.['enrichmentFailed']).toBe('true');
  });

  it('rejects host patches that invent externalIds', async () => {
    const evil: IAIEnricher = {
      async enrich(_raw, ops) {
        return ops.map((o) =>
          o.entity === 'course' ? { ...o, key: { ...o.key, externalId: 'invented' } } : o
        );
      },
    };
    const { host } = makeHost([COURSE, ATTENDANCE_GAP], { enricher: evil });
    const envelope = await runClientScrape(host);
    expect(envelope.ops[0]?.key.externalId).toBe('skyward-course-A1');
  });
});
