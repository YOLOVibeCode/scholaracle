/**
 * Per-run course gaps from sync coverage (flat list for the runs page).
 */

import React from 'react';
import type { ISlcRunCoverage } from '@scholaracle/contracts';
import { describeGapKind } from '@/lib/sync/gapLabels';

export function RunGapList({
  runId,
  coverage,
}: {
  readonly runId: string;
  readonly coverage: ISlcRunCoverage;
}): React.ReactElement {
  const lines: { key: string; text: string }[] = [];
  for (const stu of coverage.students) {
    for (const g of stu.gaps) {
      lines.push({
        key: `${runId}-${stu.studentExternalId}-${g.course}-${g.kind}`,
        text: `${g.course}: ${describeGapKind(g.kind)}`,
      });
    }
  }
  if (lines.length === 0) {
    return <React.Fragment />;
  }
  return (
    <ul
      className="mt-1 list-inside list-disc text-xs text-muted-foreground"
      data-testid="list-gaps"
    >
      {lines.map((line) => (
        <li key={line.key} data-testid={`run-gap-${line.key}`}>
          {line.text}
        </li>
      ))}
    </ul>
  );
}
