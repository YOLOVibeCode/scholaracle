/**
 * Pipeline tests for fail-open enrichment. Uses a stub IScraperResolver so
 * recipes never run (ISP: host may inject a resolver).
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import { FakePageDriver } from '../driver/FakePageDriver';
import type { IScraperModule, IScraperResolver } from '../registry/module';
import type { IAIEnricher, IClientScrapeHost, IIngestUploader } from './types';
import { SyncError, STUDENT_MISMATCH_MESSAGE } from './types';
import { runClientScrape } from './runClientScrape';
import { aeriesBuiltinModule } from '../registry/builtin-modules';
import type { IAeriesFullExtract } from '../extractors/aeries/aeries-extractors';

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
  it('throws SyncError ZERO_ROWS when transform yields no ops', async () => {
    const emptyMod: IScraperModule = {
      metadata: {
        id: 'skyward',
        name: 'Skyward',
        adapterId: 'com.skyward.grade',
        version: '0.1.0',
        hosts: ['*.skyward.com'],
        entities: [],
        entry: 'builtin:skyward',
        publisher: 'scholaracle',
      },
      scrape: async () => ({ student: 'Emma', courses: [], timestamp: NOW }),
      transform: () => [],
    };
    const emptyResolver: IScraperResolver = {
      async resolve() {
        return { module: emptyMod, canRun: true, checkErrors: [] };
      },
    };
    const { host } = makeHost([], { resolver: emptyResolver });
    await expect(runClientScrape(host)).rejects.toThrow('ZERO_ROWS');
  });

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

function m402TwoStudentExtract(): IAeriesFullExtract {
  return {
    timestamp: NOW,
    students: [
      {
        name: 'Ann Example',
        studentId: '728001',
        grade: '10',
        school: 'North High School',
        courses: [
          {
            period: '1',
            name: 'Spanish 2 a',
            term: 'Quarter 2',
            teacher: 'Rivera, M',
            teacherEmail: 'm.rivera@district.example',
            room: 'S108',
            currentGrade: 92,
            currentPercent: 92.1,
            missingCount: 0,
            assignments: [],
          },
        ],
        attendance: [],
      },
      {
        name: 'Ben Example',
        studentId: '826002',
        grade: '8',
        school: 'West Middle School',
        courses: [
          {
            period: '7',
            name: 'Math 8',
            term: 'Quarter 2',
            teacher: 'Lindqvist, R',
            teacherEmail: 'r.lindqvist@district.example',
            room: 'B12',
            currentGrade: 100,
            currentPercent: 100,
            missingCount: 0,
            assignments: [],
          },
        ],
        attendance: [],
      },
    ],
  };
}

describe('runClientScrape studentNameHint', () => {
  const uploaded: ISlcDeltaOp[][] = [];
  let reportedFailure: string | undefined;

  const uploader: IIngestUploader = {
    async upload(envelope) {
      uploaded.push([...envelope.ops]);
    },
    async reportFailure(_runId, _sourceId, error) {
      reportedFailure = error;
    },
  };

  beforeEach(() => {
    uploaded.length = 0;
    reportedFailure = undefined;
  });

  function aeriesHost(studentNameHint: string): IClientScrapeHost {
    return {
      driver: new FakePageDriver(),
      config: {
        provider: 'aeries',
        adapterId: 'com.aeries.sis',
        adapterVersion: 'test@1.0.0',
        baseUrl: 'https://district.aeries.net/student/',
        sourceId: 'src-aeries',
        studentExternalId: 'stu-ben',
        institutionExternalId: 'district.aeries.net',
        studentNameHint,
      },
      clientType: 'mobile',
      uploader,
      resolver: {
        async resolve() {
          return {
            module: {
              ...aeriesBuiltinModule,
              scrape: async () => m402TwoStudentExtract() as unknown as Record<string, unknown>,
            },
            canRun: true,
            checkErrors: [],
          };
        },
      },
    };
  }

  it('files ops only for the hinted student with the configured studentExternalId', async () => {
    const envelope = await runClientScrape(aeriesHost('Ben Example'));
    expect(envelope.ops.every((o) => o.key.studentExternalId === 'stu-ben')).toBe(true);
    const courseOps = envelope.ops.filter((o) => o.entity === 'course');
    expect(courseOps.some((o) => String(o.record?.['title']).includes('Math 8'))).toBe(true);
    expect(courseOps.some((o) => String(o.record?.['title']).includes('Spanish'))).toBe(false);
    expect(uploaded).toHaveLength(1);
  });

  it('throws STUDENT_MISMATCH with zero upload when hint matches no student', async () => {
    await expect(runClientScrape(aeriesHost('Nobody Example'))).rejects.toMatchObject({
      name: 'SyncError',
      phase: 'STUDENT_MISMATCH',
      message: STUDENT_MISMATCH_MESSAGE,
    } satisfies Partial<SyncError>);
    expect(uploaded).toHaveLength(0);
    expect(reportedFailure).toBe(STUDENT_MISMATCH_MESSAGE);
  });
});
