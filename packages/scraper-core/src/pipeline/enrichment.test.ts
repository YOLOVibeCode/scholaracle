/**
 * Join-gap enricher + fail-open sanitizer — TDD.
 *
 * AI (and the deterministic JoinGapEnricher) may only fill empty allowlisted
 * FKs using IDs that already exist in the op set. Anything else is discarded.
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import {
  JoinGapEnricher,
  applyEnrichersFailOpen,
  sanitizeEnrichedOps,
  DEFAULT_ENRICHER_TIMEOUT_MS,
} from './enrichment';
import type { IAIEnricher } from './types';

const NOW = '2026-01-15T10:00:00.000Z';

function op(
  entity: ISlcDeltaOp['entity'],
  externalId: string,
  record: Record<string, unknown>,
  extraKey?: { courseExternalId?: string }
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
      ...(extraKey?.courseExternalId ? { courseExternalId: extraKey.courseExternalId } : {}),
    },
    observedAt: NOW,
    record,
  };
}

const algebra = op('course', 'skyward-course-A1', {
  title: 'ALGEBRA 1',
  period: '1',
  teacherName: 'Smith',
});
const english = op('course', 'skyward-course-E2', {
  title: 'ENGLISH 2',
  period: '2',
  teacherName: 'Jones',
});
const hw3 = op(
  'assignment',
  'skyward-assign-1-hw-3',
  { title: 'HW 3', courseExternalId: 'skyward-course-A1' },
  { courseExternalId: 'skyward-course-A1' }
);

describe('sanitizeEnrichedOps', () => {
  it('rejects a different op count (enricher must not add or drop ops)', () => {
    const original = [algebra];
    const warnings: string[] = [];
    const result = sanitizeEnrichedOps(original, [algebra, english], (m) => warnings.push(m));
    expect(result).toBe(original);
    expect(warnings[0]).toMatch(/count/i);
  });

  it('rejects a changed key.externalId', () => {
    const original = [algebra];
    const mutated = [{ ...algebra, key: { ...algebra.key, externalId: 'invented-id' } }];
    const result = sanitizeEnrichedOps(original, mutated);
    expect(result[0]?.key.externalId).toBe('skyward-course-A1');
  });

  it('rejects filling courseExternalId with an id not in the envelope', () => {
    const attendance = op('attendanceEvent', 'att-1', {
      date: '2026-01-10',
      status: 'present',
      periodName: '1',
    });
    const original = [algebra, attendance];
    const mutated = [
      algebra,
      {
        ...attendance,
        record: { ...attendance.record, courseExternalId: 'skyward-course-NOPE' },
      },
    ];
    const result = sanitizeEnrichedOps(original, mutated);
    expect(result[1]?.record?.['courseExternalId']).toBeUndefined();
  });

  it('keeps a fill of an empty courseExternalId that matches an existing course', () => {
    const attendance = op('attendanceEvent', 'att-1', {
      date: '2026-01-10',
      status: 'present',
      periodName: '1',
    });
    const original = [algebra, attendance];
    const mutated = [
      algebra,
      {
        ...attendance,
        key: { ...attendance.key, courseExternalId: 'skyward-course-A1' },
        record: { ...attendance.record, courseExternalId: 'skyward-course-A1' },
      },
    ];
    const result = sanitizeEnrichedOps(original, mutated);
    expect(result[1]?.record?.['courseExternalId']).toBe('skyward-course-A1');
    expect(result[1]?.key.courseExternalId).toBe('skyward-course-A1');
  });

  it('does not overwrite a non-empty courseExternalId', () => {
    const attendance = op('attendanceEvent', 'att-1', {
      date: '2026-01-10',
      status: 'present',
      courseExternalId: 'skyward-course-E2',
    });
    const original = [algebra, english, attendance];
    const mutated = [
      algebra,
      english,
      { ...attendance, record: { ...attendance.record, courseExternalId: 'skyward-course-A1' } },
    ];
    const result = sanitizeEnrichedOps(original, mutated);
    expect(result[2]?.record?.['courseExternalId']).toBe('skyward-course-E2');
  });
});

describe('JoinGapEnricher', () => {
  const enricher = new JoinGapEnricher();

  it('fills attendance courseExternalId from a unique period match', async () => {
    const attendance = op('attendanceEvent', 'att-1', {
      date: '2026-01-10',
      status: 'present',
      periodName: '1',
      courseName: '',
    });
    const ops = await enricher.enrich({}, [algebra, english, attendance]);
    expect(ops[2]?.record?.['courseExternalId']).toBe('skyward-course-A1');
    expect(ops[2]?.key.courseExternalId).toBe('skyward-course-A1');
    expect(ops[2]?.record?.['courseName']).toBe('ALGEBRA 1');
  });

  it('fills attendance courseExternalId from a unique normalized course name', async () => {
    const attendance = op('attendanceEvent', 'att-1', {
      date: '2026-01-10',
      status: 'present',
      courseName: 'Algebra 1',
    });
    const ops = await enricher.enrich({}, [algebra, english, attendance]);
    expect(ops[2]?.record?.['courseExternalId']).toBe('skyward-course-A1');
  });

  it('does not fill when two courses share the same period', async () => {
    const otherPeriod1 = op('course', 'skyward-course-B9', {
      title: 'BAND',
      period: '1',
      teacherName: 'Lee',
    });
    const attendance = op('attendanceEvent', 'att-1', {
      date: '2026-01-10',
      status: 'present',
      periodName: '1',
    });
    const ops = await enricher.enrich({}, [algebra, otherPeriod1, attendance]);
    expect(ops[2]?.record?.['courseExternalId']).toBeUndefined();
  });

  it('links a message to an assignment on unique title match', async () => {
    const msg = op('message', 'msg-1', {
      subject: 'HW 3 reminder',
      body: 'Please finish HW 3 tonight',
      senderName: 'Canvas',
    });
    const ops = await enricher.enrich({}, [algebra, hw3, msg]);
    expect(ops[2]?.record?.['assignmentExternalId']).toBe('skyward-assign-1-hw-3');
  });

  it('does not link a message when two assignments match the title', async () => {
    const hw3b = op(
      'assignment',
      'skyward-assign-2-hw-3',
      { title: 'HW 3', courseExternalId: 'skyward-course-E2' },
      { courseExternalId: 'skyward-course-E2' }
    );
    const msg = op('message', 'msg-1', { subject: 'HW 3', body: 'HW 3' });
    const ops = await enricher.enrich({}, [algebra, english, hw3, hw3b, msg]);
    expect(ops[4]?.record?.['assignmentExternalId']).toBeUndefined();
  });

  it('links courseMaterial to an assignment on unique title co-occurrence', async () => {
    const material = op(
      'courseMaterial',
      'file-1',
      { title: 'HW 3 worksheet.pdf', courseExternalId: 'skyward-course-A1', type: 'document' },
      { courseExternalId: 'skyward-course-A1' }
    );
    const ops = await enricher.enrich({}, [algebra, hw3, material]);
    expect(ops[2]?.record?.['assignmentExternalId']).toBe('skyward-assign-1-hw-3');
  });

  it('fills assignment courseExternalId from unique course title when missing', async () => {
    const orphan = op('assignment', 'assign-orphan', { title: 'Quiz', courseName: 'ALGEBRA 1' });
    const ops = await enricher.enrich({}, [algebra, english, orphan]);
    expect(ops[2]?.record?.['courseExternalId']).toBe('skyward-course-A1');
    expect(ops[2]?.key.courseExternalId).toBe('skyward-course-A1');
  });

  it('never invents an externalId that was not already in the op set', async () => {
    const attendance = op('attendanceEvent', 'att-1', {
      date: '2026-01-10',
      status: 'present',
      periodName: '9',
      courseName: 'Not A Real Class',
    });
    const ops = await enricher.enrich({}, [algebra, attendance]);
    const ids = ops.map((o) => o.key.externalId);
    expect(ids).toEqual(['skyward-course-A1', 'att-1']);
    expect(ops[1]?.record?.['courseExternalId']).toBeUndefined();
  });
});

describe('applyEnrichersFailOpen', () => {
  const attendance = op('attendanceEvent', 'att-1', {
    date: '2026-01-10',
    status: 'present',
    periodName: '1',
  });
  const baseOps = [algebra, attendance];

  it('returns original ops when the enricher throws', async () => {
    const boom: IAIEnricher = {
      async enrich() {
        throw new Error('model down');
      },
    };
    const warnings: string[] = [];
    const result = await applyEnrichersFailOpen({
      enrichers: [boom],
      rawExtract: {},
      ops: baseOps,
      onWarning: (m) => warnings.push(m),
    });
    expect(result.ops).toBe(baseOps);
    expect(result.failed).toBe(true);
    expect(warnings[0]).toMatch(/model down/);
  });

  it('returns original ops when the enricher times out', async () => {
    const hung: IAIEnricher = {
      enrich: () => new Promise(() => undefined),
    };
    const result = await applyEnrichersFailOpen({
      enrichers: [hung],
      rawExtract: {},
      ops: baseOps,
      timeoutMs: 20,
    });
    expect(result.ops).toBe(baseOps);
    expect(result.failed).toBe(true);
  });

  it('discards illegal host patches and keeps prior legal fills', async () => {
    const evil: IAIEnricher = {
      async enrich(_raw: Record<string, unknown>, ops: ISlcDeltaOp[]): Promise<ISlcDeltaOp[]> {
        return ops.map((o, i) => (i === 0 ? { ...o, key: { ...o.key, externalId: 'hacked' } } : o));
      },
    };
    const result = await applyEnrichersFailOpen({
      enrichers: [new JoinGapEnricher(), evil],
      rawExtract: {},
      ops: baseOps,
    });
    expect(result.ops[0]?.key.externalId).toBe('skyward-course-A1');
    expect(result.ops[1]?.record?.['courseExternalId']).toBe('skyward-course-A1');
  });

  it('exposes a finite default timeout', () => {
    expect(DEFAULT_ENRICHER_TIMEOUT_MS).toBeGreaterThan(0);
    expect(DEFAULT_ENRICHER_TIMEOUT_MS).toBeLessThanOrEqual(8000);
  });
});
