/**
 * prepareIngestOps — TDD for off / shadow / apply (fail-open).
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { IAIEnricher } from '@scholaracle/scraper-core';
import { parseEnrichOpsMode, prepareIngestOps, resolveEnrichOpsMode } from './enrichOps';

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

const course = op('course', 'skyward-course-A1', {
  title: 'ALGEBRA 1',
  period: '1',
  teacherName: 'Smith',
});
const attendanceGap = op('attendanceEvent', 'att-1', {
  date: '2026-01-10',
  status: 'present',
  periodName: '1',
});
const gappedOps = [course, attendanceGap];

describe('parseEnrichOpsMode', () => {
  it('defaults unknown and empty values to off', () => {
    expect(parseEnrichOpsMode(undefined)).toBe('off');
    expect(parseEnrichOpsMode('')).toBe('off');
    expect(parseEnrichOpsMode('APPLY')).toBe('off');
  });

  it('accepts off, shadow, and apply', () => {
    expect(parseEnrichOpsMode('off')).toBe('off');
    expect(parseEnrichOpsMode('shadow')).toBe('shadow');
    expect(parseEnrichOpsMode('apply')).toBe('apply');
  });
});

describe('resolveEnrichOpsMode', () => {
  const previous = process.env['ENRICH_OPS_MODE'];

  afterEach(() => {
    if (previous === undefined) delete process.env['ENRICH_OPS_MODE'];
    else process.env['ENRICH_OPS_MODE'] = previous;
  });

  it('prefers explicit config over the environment', () => {
    process.env['ENRICH_OPS_MODE'] = 'apply';
    expect(resolveEnrichOpsMode('shadow')).toBe('shadow');
  });

  it('reads ENRICH_OPS_MODE when config is omitted', () => {
    process.env['ENRICH_OPS_MODE'] = 'apply';
    expect(resolveEnrichOpsMode()).toBe('apply');
  });
});

describe('prepareIngestOps', () => {
  it('off returns original ops and does not patch', async () => {
    const result = await prepareIngestOps({ ops: gappedOps, mode: 'off' });
    expect(result.ops).toBe(gappedOps);
    expect(result.patchCount).toBe(0);
    expect(result.applied).toBe(false);
    expect(result.ops[1]?.record?.['courseExternalId']).toBeUndefined();
  });

  it('shadow reports patches but returns original ops', async () => {
    const result = await prepareIngestOps({ ops: gappedOps, mode: 'shadow' });
    expect(result.patchCount).toBeGreaterThan(0);
    expect(result.applied).toBe(false);
    expect(result.ops).toBe(gappedOps);
    expect(result.ops[1]?.record?.['courseExternalId']).toBeUndefined();
  });

  it('apply fills attendance courseExternalId from a unique period', async () => {
    const result = await prepareIngestOps({ ops: gappedOps, mode: 'apply' });
    expect(result.applied).toBe(true);
    expect(result.failed).toBe(false);
    expect(result.ops[1]?.record?.['courseExternalId']).toBe('skyward-course-A1');
    expect(result.ops[1]?.key.courseExternalId).toBe('skyward-course-A1');
  });

  it('apply is idempotent when the FK is already filled', async () => {
    const filled = await prepareIngestOps({ ops: gappedOps, mode: 'apply' });
    const again = await prepareIngestOps({ ops: filled.ops, mode: 'apply' });
    expect(again.patchCount).toBe(0);
    expect(again.applied).toBe(false);
    expect(again.ops[1]?.record?.['courseExternalId']).toBe('skyward-course-A1');
  });

  it('apply falls back to original ops when revalidate fails', async () => {
    const result = await prepareIngestOps({
      ops: gappedOps,
      mode: 'apply',
      revalidate: () => ({ valid: false, error: 'nope' }),
    });
    expect(result.applied).toBe(false);
    expect(result.failed).toBe(true);
    expect(result.ops).toBe(gappedOps);
    expect(result.patchCount).toBeGreaterThan(0);
  });

  it('apply falls back to original ops when the enricher throws', async () => {
    const boom: IAIEnricher = {
      async enrich() {
        throw new Error('model down');
      },
    };
    const result = await prepareIngestOps({ ops: gappedOps, mode: 'apply', enricher: boom });
    expect(result.ops).toBe(gappedOps);
    expect(result.applied).toBe(false);
    expect(result.failed).toBe(true);
  });
});
