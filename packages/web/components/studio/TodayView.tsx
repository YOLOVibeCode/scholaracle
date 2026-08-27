'use client';

import type { ITodayView } from '@scholaracle/contracts';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { OfflineSaveButton } from './OfflineSaveButton';

export interface ITodayViewProps {
  readonly view: ITodayView;
  readonly token?: string;
}

/**
 * Student Today home. Presentational — takes ITodayView as props. No grades UI.
 */
export function TodayView({ view, token }: ITodayViewProps): React.ReactElement {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <h1
        data-testid="studio-encouragement"
        className="text-3xl font-semibold tracking-tight text-balance"
      >
        {view.encouragement}
      </h1>

      {view.next ? (
        <section data-testid="studio-next" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Next: {view.next.courseName}
            {view.next.dueAt ? ` · due ${formatDue(view.next.dueAt)}` : ''}
          </p>
          <p className="text-xl font-medium">{view.next.title}</p>
          <Button asChild size="lg" className="w-fit">
            <Link
              href={`/studio/assignments/${encodeURIComponent(view.next.assignmentExternalId)}`}
              data-testid="studio-primary-cta"
            >
              {view.next.primaryCtaLabel}
            </Link>
          </Button>
          {token !== undefined && view.next.courseExternalId !== undefined ? (
            <OfflineSaveButton
              courseExternalId={view.next.courseExternalId}
              courseName={view.next.courseName}
              token={token}
            />
          ) : null}
        </section>
      ) : null}

      {view.alsoToday.length > 0 ? (
        <section data-testid="studio-also-today" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Also today</h2>
          <ul className="space-y-2">
            {view.alsoToday.map((step) => (
              <li key={step.assignmentExternalId}>
                <Link
                  href={`/studio/assignments/${encodeURIComponent(step.assignmentExternalId)}`}
                  className="text-base text-foreground/80 hover:underline"
                >
                  {step.title}
                  <span className="text-muted-foreground"> — {step.courseName}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
