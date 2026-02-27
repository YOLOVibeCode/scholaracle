/**
 * Envelope validation — verifies that adapter output conforms to the
 * ISlcIngestEnvelopeV1 contract and that the data is usable by the application.
 *
 * Used by the test harness to validate real scraping/API output.
 */

import type { ISlcIngestEnvelopeV1, ISlcDeltaOp, SlcEntityType } from '@scholaracle/contracts';

export interface IValidationCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
  readonly severity: 'error' | 'warning' | 'info';
}

export interface IValidationReport {
  readonly provider: string;
  readonly timestamp: string;
  readonly durationMs: number;
  readonly checks: readonly IValidationCheck[];
  readonly summary: {
    readonly totalChecks: number;
    readonly passed: number;
    readonly warnings: number;
    readonly errors: number;
  };
  readonly entityCounts: Readonly<Record<string, number>>;
  readonly sampleOps: readonly ISlcDeltaOp[];
}

const VALID_ENTITIES: readonly SlcEntityType[] = [
  'assignment',
  'eventSeries',
  'eventOverride',
  'academicTerm',
  'institution',
  'course',
  'gradeSnapshot',
  'attendanceEvent',
  'teacher',
  'courseMaterial',
  'message',
];

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Validate an ingest envelope and produce a detailed report.
 */
export function validateEnvelope(
  envelope: ISlcIngestEnvelopeV1,
  provider: string,
  durationMs: number
): IValidationReport {
  const checks: IValidationCheck[] = [];

  // ── Envelope structure ──
  checks.push(
    check(
      'Schema version',
      envelope.schemaVersion === 'slc.ingest.v1',
      `schemaVersion = "${envelope.schemaVersion}"`
    )
  );

  checks.push(
    check(
      'Run metadata present',
      Boolean(envelope.run?.runId && envelope.run?.provider && envelope.run?.adapterId),
      `runId=${envelope.run?.runId}, provider=${envelope.run?.provider}`
    )
  );

  checks.push(
    check(
      'Run provider matches',
      envelope.run?.provider === provider,
      `Expected "${provider}", got "${envelope.run?.provider}"`,
      envelope.run?.provider === provider ? 'info' : 'error'
    )
  );

  checks.push(
    check(
      'Run startedAt is valid ISO',
      ISO_DATE_REGEX.test(envelope.run?.startedAt ?? ''),
      `startedAt = "${envelope.run?.startedAt}"`
    )
  );

  checks.push(
    check(
      'Source metadata present',
      Boolean(envelope.source?.sourceId && envelope.source?.displayName),
      `sourceId=${envelope.source?.sourceId}, displayName="${envelope.source?.displayName}"`
    )
  );

  checks.push(
    check('Ops is an array', Array.isArray(envelope.ops), `ops type: ${typeof envelope.ops}`)
  );

  checks.push(
    check(
      'Ops array is non-empty',
      Array.isArray(envelope.ops) && envelope.ops.length > 0,
      `${envelope.ops?.length ?? 0} ops`,
      (envelope.ops?.length ?? 0) > 0 ? 'info' : 'warning'
    )
  );

  // ── Per-op validation ──
  const entityCounts: Record<string, number> = {};
  let invalidEntityCount = 0;
  let missingKeyCount = 0;
  let missingRecordCount = 0;
  let invalidDateCount = 0;

  for (const op of envelope.ops ?? []) {
    entityCounts[op.entity] = (entityCounts[op.entity] ?? 0) + 1;

    if (!VALID_ENTITIES.includes(op.entity)) invalidEntityCount++;
    if (!op.key?.provider || !op.key?.adapterId || !op.key?.externalId) missingKeyCount++;
    if (op.op === 'upsert' && !op.record) missingRecordCount++;
    if (op.observedAt && !ISO_DATE_REGEX.test(op.observedAt)) invalidDateCount++;
  }

  checks.push(
    check(
      'All entity types are valid',
      invalidEntityCount === 0,
      invalidEntityCount > 0 ? `${invalidEntityCount} ops with invalid entity type` : 'All valid'
    )
  );

  checks.push(
    check(
      'All ops have complete keys',
      missingKeyCount === 0,
      missingKeyCount > 0 ? `${missingKeyCount} ops missing key fields` : 'All complete'
    )
  );

  checks.push(
    check(
      'All upsert ops have records',
      missingRecordCount === 0,
      missingRecordCount > 0
        ? `${missingRecordCount} upsert ops missing record`
        : 'All have records'
    )
  );

  checks.push(
    check(
      'All observedAt dates are valid ISO',
      invalidDateCount === 0,
      invalidDateCount > 0 ? `${invalidDateCount} ops with invalid observedAt` : 'All valid'
    )
  );

  // ── Entity-specific checks ──
  const assignments = (envelope.ops ?? []).filter((o) => o.entity === 'assignment');
  if (assignments.length > 0) {
    const withTitle = assignments.filter((a) => a.record?.['title']);
    checks.push(
      check(
        'Assignments have titles',
        withTitle.length === assignments.length,
        `${withTitle.length}/${assignments.length} have titles`,
        withTitle.length === assignments.length ? 'info' : 'warning'
      )
    );

    const withStatus = assignments.filter((a) => a.record?.['status']);
    checks.push(
      check(
        'Assignments have status',
        withStatus.length > 0,
        `${withStatus.length}/${assignments.length} have status`,
        withStatus.length > 0 ? 'info' : 'warning'
      )
    );

    const withPoints = assignments.filter(
      (a) => a.record?.['pointsPossible'] !== undefined || a.record?.['pointsEarned'] !== undefined
    );
    checks.push(
      check(
        'Assignments have point data',
        withPoints.length > 0,
        `${withPoints.length}/${assignments.length} have point data`,
        withPoints.length > 0 ? 'info' : 'warning'
      )
    );
  }

  const grades = (envelope.ops ?? []).filter((o) => o.entity === 'gradeSnapshot');
  if (grades.length > 0) {
    const withPercent = grades.filter((g) => typeof g.record?.['percentGrade'] === 'number');
    checks.push(
      check(
        'Grade snapshots have percentGrade',
        withPercent.length === grades.length,
        `${withPercent.length}/${grades.length} have percentGrade`,
        withPercent.length === grades.length ? 'info' : 'warning'
      )
    );
  }

  const courses = (envelope.ops ?? []).filter((o) => o.entity === 'course');
  if (courses.length > 0) {
    const withSubject = courses.filter((c) => c.record?.['subjectArea']);
    checks.push(
      check(
        'Courses have subjectArea (reconciled)',
        withSubject.length > 0,
        `${withSubject.length}/${courses.length} have subjectArea`,
        withSubject.length > 0 ? 'info' : 'warning'
      )
    );

    const withTeacher = courses.filter((c) => c.record?.['teacherName']);
    checks.push(
      check(
        'Courses have teacherName',
        withTeacher.length > 0,
        `${withTeacher.length}/${courses.length} have teacherName`,
        withTeacher.length > 0 ? 'info' : 'warning'
      )
    );
  }

  // ── Summary ──
  const errors = checks.filter((c) => !c.passed && c.severity === 'error').length;
  const warnings = checks.filter((c) => !c.passed && c.severity === 'warning').length;
  const passed = checks.filter((c) => c.passed).length;

  // Sample first 3 ops of each entity type
  const sampleOps: ISlcDeltaOp[] = [];
  for (const entity of Object.keys(entityCounts)) {
    const opsOfType = (envelope.ops ?? []).filter((o) => o.entity === entity);
    sampleOps.push(...opsOfType.slice(0, 2));
  }

  return {
    provider,
    timestamp: new Date().toISOString(),
    durationMs,
    checks,
    summary: { totalChecks: checks.length, passed, warnings, errors },
    entityCounts,
    sampleOps,
  };
}

function check(
  name: string,
  passed: boolean,
  message: string,
  severity: 'error' | 'warning' | 'info' = passed ? 'info' : 'error'
): IValidationCheck {
  return { name, passed, message, severity };
}

/**
 * Format a validation report as human-readable text.
 */
export function formatReport(report: IValidationReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push(`  Scholaracle Scrape Harness — ${report.provider}`);
  lines.push(`  ${report.timestamp}  (${report.durationMs}ms)`);
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');

  // Entity summary
  lines.push('  Entity Counts:');
  for (const [entity, count] of Object.entries(report.entityCounts)) {
    lines.push(`    ${entity.padEnd(20)} ${count}`);
  }
  const totalOps = Object.values(report.entityCounts).reduce((a, b) => a + b, 0);
  lines.push(`    ${'TOTAL'.padEnd(20)} ${totalOps}`);
  lines.push('');

  // Checks
  lines.push('  Validation Checks:');
  for (const c of report.checks) {
    const icon = c.passed ? '✓' : c.severity === 'warning' ? '⚠' : '✗';
    const color = c.passed ? '' : c.severity === 'warning' ? ' [WARN]' : ' [FAIL]';
    lines.push(`    ${icon} ${c.name}${color}`);
    lines.push(`      ${c.message}`);
  }
  lines.push('');

  // Summary
  const { passed, warnings, errors, totalChecks } = report.summary;
  const verdict = errors > 0 ? 'FAILED' : warnings > 0 ? 'PASSED WITH WARNINGS' : 'PASSED';
  lines.push(`  Result: ${verdict}`);
  lines.push(`  ${passed}/${totalChecks} passed, ${warnings} warnings, ${errors} errors`);
  lines.push('');

  // Sample data
  if (report.sampleOps.length > 0) {
    lines.push('  Sample Data (first 2 per entity type):');
    lines.push('  ────────────────────────────────────────');
    for (const op of report.sampleOps) {
      lines.push(`    [${op.entity}] ${op.key.externalId}`);
      if (op.record) {
        const preview = JSON.stringify(op.record, null, 2)
          .split('\n')
          .map((l) => `      ${l}`)
          .join('\n');
        lines.push(preview);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}
