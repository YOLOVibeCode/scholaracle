import React from 'react';
import type { ISlcIngestRunStep } from '@scholaracle/contracts';

export function RunStepList({
  runId,
  steps,
}: {
  readonly runId: string;
  readonly steps: readonly ISlcIngestRunStep[];
}): React.ReactElement {
  if (steps.length === 0) {
    return <React.Fragment />;
  }
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground" data-testid="list-run-steps">
      {steps.map((step) => (
        <li key={`${runId}-${step.name}-${step.startedAt}`} data-testid={`run-step-${step.name}`}>
          <span className={step.ok ? 'text-foreground' : 'text-red-600'}>{step.name}</span>
          <span className="ml-2 tabular-nums">{step.ms}ms</span>
          {step.error && <span className="ml-2 text-red-600">{step.error}</span>}
        </li>
      ))}
    </ul>
  );
}
