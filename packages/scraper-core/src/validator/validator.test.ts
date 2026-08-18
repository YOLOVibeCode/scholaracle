/**
 * Envelope validator tests — join-completeness gates (TDD).
 */

import { validateEnvelope } from './validator';
import {
  SLC_INGEST_SCHEMA_VERSION_V1,
  type ISlcDeltaOp,
  type ISlcIngestEnvelopeV1,
} from '@scholaracle/contracts';

const NOW = '2026-08-14T12:00:00.000Z';

function op(
  entity: ISlcDeltaOp['entity'],
  externalId: string,
  record: Record<string, unknown>,
  courseExternalId?: string
): ISlcDeltaOp {
  return {
    op: 'upsert',
    entity,
    key: {
      provider: 'canvas',
      adapterId: 'canvas::default',
      externalId,
      ...(courseExternalId ? { courseExternalId } : {}),
    },
    observedAt: NOW,
    record,
  };
}

function envelope(ops: readonly ISlcDeltaOp[], provider = 'canvas'): ISlcIngestEnvelopeV1 {
  return {
    schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
    run: {
      runId: 'run-1',
      startedAt: NOW,
      provider,
      adapterId: `${provider}::default`,
      adapterVersion: 'test@1.0.0',
      mode: 'delta',
      timezone: 'America/Chicago',
    },
    source: { sourceId: 'src-1', displayName: 'Test' },
    ops,
  };
}

function checkNames(
  result: ReturnType<typeof validateEnvelope>,
  severity: 'warning' | 'error'
): string[] {
  return result.checks.filter((c) => c.severity === severity).map((c) => c.name);
}

describe('validateEnvelope join completeness', () => {
  it('passes a fully joinable LMS envelope with no join warnings', () => {
    const result = validateEnvelope(
      envelope([
        op('course', 'canvas-course-123', {
          title: 'Algebra 1',
          teacherName: 'Chang',
          period: '4',
          courseCode: 'ALG1',
        }),
        op(
          'assignment',
          'canvas-assignment-987',
          { title: '5.A Practice', courseExternalId: 'canvas-course-123' },
          'canvas-course-123'
        ),
        op(
          'gradeSnapshot',
          'canvas-grade-123',
          { courseExternalId: 'canvas-course-123', asOfDate: '2026-08-14' },
          'canvas-course-123'
        ),
        op(
          'courseMaterial',
          'canvas-file-555',
          {
            title: '5.A.pdf',
            courseExternalId: 'canvas-course-123',
            assignmentExternalId: 'canvas-assignment-987',
            type: 'document',
          },
          'canvas-course-123'
        ),
      ])
    );

    expect(result.passed).toBe(true);
    expect(checkNames(result, 'warning')).not.toEqual(
      expect.arrayContaining([
        'join-course-fk',
        'join-course-exists',
        'join-assignment-fk',
        'join-hints-course',
        'join-role-lms-assignments',
        'join-role-lms-materials',
      ])
    );
  });

  it('warns when an assignment is missing courseExternalId', () => {
    const result = validateEnvelope(
      envelope([
        op('course', 'canvas-course-123', { title: 'Algebra 1', teacherName: 'Chang' }),
        op('assignment', 'canvas-assignment-987', { title: 'Homework' }),
      ])
    );

    expect(result.passed).toBe(true);
    expect(checkNames(result, 'warning')).toContain('join-course-fk');
  });

  it('warns when courseExternalId does not match a course op', () => {
    const result = validateEnvelope(
      envelope([
        op('course', 'canvas-course-123', { title: 'Algebra 1', teacherName: 'Chang' }),
        op(
          'assignment',
          'canvas-assignment-987',
          { title: 'Homework', courseExternalId: 'canvas-course-999' },
          'canvas-course-999'
        ),
      ])
    );

    expect(result.passed).toBe(true);
    expect(checkNames(result, 'warning')).toContain('join-course-exists');
  });

  it('warns when material.assignmentExternalId does not match an assignment op', () => {
    const result = validateEnvelope(
      envelope([
        op('course', 'canvas-course-123', { title: 'Algebra 1', teacherName: 'Chang' }),
        op(
          'assignment',
          'canvas-assignment-987',
          { title: 'Homework', courseExternalId: 'canvas-course-123' },
          'canvas-course-123'
        ),
        op(
          'courseMaterial',
          'canvas-file-1',
          {
            title: 'notes.pdf',
            courseExternalId: 'canvas-course-123',
            assignmentExternalId: 'canvas-assignment-missing',
            type: 'document',
          },
          'canvas-course-123'
        ),
      ])
    );

    expect(result.passed).toBe(true);
    expect(checkNames(result, 'warning')).toContain('join-assignment-fk');
  });

  it('warns when a course has no teacherName, period, or courseCode', () => {
    const result = validateEnvelope(
      envelope([op('course', 'canvas-course-123', { title: 'Algebra 1' })])
    );

    expect(result.passed).toBe(true);
    expect(checkNames(result, 'warning')).toContain('join-hints-course');
  });

  it('warns when an SIS run has courses but no gradeSnapshot', () => {
    const result = validateEnvelope(
      envelope(
        [
          op('course', 'skyward-course-4-algebra', {
            title: 'ALGEBRA 1',
            period: '4',
            teacherName: 'Chang',
          }),
        ],
        'skyward'
      )
    );

    expect(result.passed).toBe(true);
    expect(checkNames(result, 'warning')).toContain('join-role-sis-grades');
  });

  it('warns when an LMS run has courses but no assignments', () => {
    const result = validateEnvelope(
      envelope([op('course', 'canvas-course-123', { title: 'Algebra 1', teacherName: 'Chang' })])
    );

    expect(result.passed).toBe(true);
    expect(checkNames(result, 'warning')).toContain('join-role-lms-assignments');
  });

  it('warns when an LMS run has courses but no courseMaterial', () => {
    const result = validateEnvelope(
      envelope([
        op('course', 'canvas-course-123', { title: 'Algebra 1', teacherName: 'Chang' }),
        op(
          'assignment',
          'canvas-assignment-1',
          { title: 'HW', courseExternalId: 'canvas-course-123' },
          'canvas-course-123'
        ),
      ])
    );

    expect(result.passed).toBe(true);
    expect(checkNames(result, 'warning')).toContain('join-role-lms-materials');
  });
});
