import React from 'react';

export function RunWarningsList({
  runId,
  warnings,
}: {
  readonly runId: string;
  readonly warnings: readonly string[];
}): React.ReactElement {
  if (warnings.length === 0) {
    return <React.Fragment />;
  }
  return (
    <ul
      className="mt-1 list-inside list-disc text-xs text-amber-700 dark:text-amber-400"
      data-testid="list-run-warnings"
    >
      {warnings.map((warning) => (
        <li key={`${runId}-${warning}`} data-testid={`run-warning-${runId}`}>
          {warning}
        </li>
      ))}
    </ul>
  );
}
