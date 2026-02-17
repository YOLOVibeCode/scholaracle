import { validateEnvelope, formatReport } from './validate-envelope';
import type { ISlcIngestEnvelopeV1 } from '@scholaracle/contracts';

function createValidEnvelope(ops: readonly Record<string, unknown>[] = []): ISlcIngestEnvelopeV1 {
  return {
    schemaVersion: 'slc.ingest.v1',
    run: {
      runId: 'test-run',
      startedAt: new Date().toISOString(),
      provider: 'skyward',
      adapterId: 'com.skyward',
      adapterVersion: '0.1.0',
      mode: 'delta',
      timezone: 'UTC',
    },
    source: {
      sourceId: 'test-source',
      displayName: 'Test Source',
    },
    ops: ops as unknown as ISlcIngestEnvelopeV1['ops'],
  };
}

describe('validateEnvelope', () => {
  it('should pass all checks for a valid envelope with ops', () => {
    const envelope = createValidEnvelope([
      {
        op: 'upsert',
        entity: 'assignment',
        key: { provider: 'skyward', adapterId: 'com.skyward', externalId: 'a-1' },
        observedAt: new Date().toISOString(),
        record: { title: 'HW 1', status: 'graded', pointsPossible: 100, pointsEarned: 90 },
      },
      {
        op: 'upsert',
        entity: 'gradeSnapshot',
        key: { provider: 'skyward', adapterId: 'com.skyward', externalId: 'g-1' },
        observedAt: new Date().toISOString(),
        record: { courseExternalId: 'c-1', percentGrade: 92, asOfDate: '2026-02-16' },
      },
      {
        op: 'upsert',
        entity: 'course',
        key: { provider: 'skyward', adapterId: 'com.skyward', externalId: 'c-1' },
        observedAt: new Date().toISOString(),
        record: { title: 'AP Physics', subjectArea: 'science', teacherName: 'Dr. Smith' },
      },
    ]);

    const report = validateEnvelope(envelope, 'skyward', 100);

    expect(report.summary.errors).toBe(0);
    expect(report.summary.passed).toBeGreaterThan(10);
    expect(report.entityCounts['assignment']).toBe(1);
    expect(report.entityCounts['gradeSnapshot']).toBe(1);
    expect(report.entityCounts['course']).toBe(1);
  });

  it('should flag errors for empty envelope', () => {
    const envelope = createValidEnvelope([]);
    const report = validateEnvelope(envelope, 'skyward', 50);

    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBeGreaterThanOrEqual(1); // ops non-empty is a warning
  });

  it('should flag invalid entity types', () => {
    const envelope = createValidEnvelope([
      {
        op: 'upsert',
        entity: 'invalid_type',
        key: { provider: 'skyward', adapterId: 'com.skyward', externalId: 'x' },
        observedAt: new Date().toISOString(),
        record: {},
      },
    ]);

    const report = validateEnvelope(envelope, 'skyward', 50);

    const invalidCheck = report.checks.find((c) => c.name === 'All entity types are valid');
    expect(invalidCheck?.passed).toBe(false);
  });

  it('should flag missing keys', () => {
    const envelope = createValidEnvelope([
      {
        op: 'upsert',
        entity: 'assignment',
        key: { provider: 'skyward', adapterId: '', externalId: '' },
        observedAt: new Date().toISOString(),
        record: { title: 'HW' },
      },
    ]);

    const report = validateEnvelope(envelope, 'skyward', 50);

    const keyCheck = report.checks.find((c) => c.name === 'All ops have complete keys');
    expect(keyCheck?.passed).toBe(false);
  });

  it('should flag upsert ops missing record', () => {
    const envelope = createValidEnvelope([
      {
        op: 'upsert',
        entity: 'assignment',
        key: { provider: 'skyward', adapterId: 'com.skyward', externalId: 'a-1' },
        observedAt: new Date().toISOString(),
        // no record!
      },
    ]);

    const report = validateEnvelope(envelope, 'skyward', 50);

    const recordCheck = report.checks.find((c) => c.name === 'All upsert ops have records');
    expect(recordCheck?.passed).toBe(false);
  });

  it('should flag wrong provider in run metadata', () => {
    const envelope = createValidEnvelope([]);
    const report = validateEnvelope(envelope, 'canvas', 50); // mismatched provider

    const providerCheck = report.checks.find((c) => c.name === 'Run provider matches');
    expect(providerCheck?.passed).toBe(false);
    expect(providerCheck?.severity).toBe('error');
  });
});

describe('formatReport', () => {
  it('should produce human-readable output', () => {
    const envelope = createValidEnvelope([
      {
        op: 'upsert',
        entity: 'assignment',
        key: { provider: 'skyward', adapterId: 'com.skyward', externalId: 'a-1' },
        observedAt: new Date().toISOString(),
        record: { title: 'Test Assignment' },
      },
    ]);

    const report = validateEnvelope(envelope, 'skyward', 100);
    const output = formatReport(report);

    expect(output).toContain('Scholaracle Scrape Harness');
    expect(output).toContain('skyward');
    expect(output).toContain('Entity Counts');
    expect(output).toContain('assignment');
    expect(output).toContain('Validation Checks');
    expect(output).toContain('Result:');
  });
});
