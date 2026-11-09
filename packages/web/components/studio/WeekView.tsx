'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { IWeekDone, IWeekItem, IWeekView, StudentStatus } from '@scholaracle/contracts';
import {
  OWED_SECTION_TITLE,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_MARKS,
  WEEK_EMPTY_MESSAGE,
  doneSectionTitle,
  isWeekClear,
  needGlyphs,
  weekSummaryLine,
} from '@scholaracle/studio-core';
import { StudioTabs } from './StudioTabs';
import { StudentStatusSheet, type IStatusSheetTarget } from './StudentStatusSheet';

export interface IWeekViewProps {
  readonly view: IWeekView;
  /** When absent the status chips are plain text (read-only render). */
  onStatusChange?(
    assignmentExternalId: string,
    status: StudentStatus,
    note?: string
  ): Promise<void>;
}

/**
 * Student This week. Presentational — takes IWeekView as props and reports
 * status picks upward; the wrapper owns the PATCH and the refetch. No grades UI.
 */
export function WeekView({ view, onStatusChange }: IWeekViewProps): React.ReactElement {
  const [target, setTarget] = useState<IStatusSheetTarget | null>(null);
  const daysWithWork = view.days.filter((day) => day.items.length > 0);
  const clear = isWeekClear(view.counts);

  const openSheet = onStatusChange
    ? (item: IWeekItem): void =>
        setTarget({
          assignmentExternalId: item.assignmentExternalId,
          title: item.title,
          currentStatus: item.studentStatus,
        })
    : undefined;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <StudioTabs active="week" />
      <header className="flex flex-col gap-2">
        <h1
          data-testid="studio-encouragement"
          className="text-3xl font-semibold tracking-tight text-balance"
        >
          {view.encouragement}
        </h1>
        <p data-testid="studio-week-summary" className="text-sm text-muted-foreground">
          {weekSummaryLine(view.counts)}
        </p>
      </header>

      {clear ? (
        <p data-testid="studio-week-empty" className="text-lg">
          {WEEK_EMPTY_MESSAGE}
        </p>
      ) : null}

      {view.owed.length > 0 ? (
        <WeekSection
          title={OWED_SECTION_TITLE}
          testId="studio-week-owed"
          items={view.owed}
          showDue
          onStatus={openSheet}
        />
      ) : null}

      {daysWithWork.map((day) => (
        <WeekSection
          key={day.date}
          title={day.label}
          testId={`studio-week-day-${day.date}`}
          items={day.items}
          showDue={false}
          onStatus={openSheet}
        />
      ))}

      {view.doneThisWeek.length > 0 ? (
        <section data-testid="studio-week-done" className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {doneSectionTitle(view.doneThisWeek.length)}
          </h2>
          <ul className="divide-y">
            {view.doneThisWeek.map((done) => (
              <DoneRow key={done.assignmentExternalId} done={done} />
            ))}
          </ul>
        </section>
      ) : null}

      {onStatusChange ? (
        <StudentStatusSheet
          target={target}
          onClose={() => setTarget(null)}
          onSubmit={onStatusChange}
        />
      ) : null}
    </div>
  );
}

function WeekSection({
  title,
  testId,
  items,
  showDue,
  onStatus,
}: {
  readonly title: string;
  readonly testId: string;
  readonly items: readonly IWeekItem[];
  readonly showDue: boolean;
  readonly onStatus?: (item: IWeekItem) => void;
}): React.ReactElement {
  return (
    <section data-testid={testId} className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <ul className="divide-y">
        {items.map((item) => (
          <WeekRow
            key={item.assignmentExternalId}
            item={item}
            showDue={showDue}
            onStatus={onStatus}
          />
        ))}
      </ul>
    </section>
  );
}

function WeekRow({
  item,
  showDue,
  onStatus,
}: {
  readonly item: IWeekItem;
  readonly showDue: boolean;
  readonly onStatus?: (item: IWeekItem) => void;
}): React.ReactElement {
  const statusLabel = STUDENT_STATUS_LABELS[item.studentStatus];
  const due = showDue ? formatDue(item.dueAt) : '';
  return (
    <li
      data-testid={`studio-week-item-${item.assignmentExternalId}`}
      className="flex items-start justify-between gap-4 py-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={`/studio/assignments/${encodeURIComponent(item.assignmentExternalId)}`}
          className="text-base font-medium hover:underline"
        >
          {item.title}
        </Link>
        <p className="text-sm text-muted-foreground">
          {item.courseName}
          {due !== '' ? ` · Due ${due}` : ''}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">
            {item.humanStatus}
          </span>
          {needGlyphs(item.needs).map((need) => (
            <span key={need.need} className="text-muted-foreground" title={need.label}>
              <span aria-hidden="true">{need.glyph}</span> {need.label}
            </span>
          ))}
        </div>
        {item.warning !== undefined ? (
          <p data-testid="studio-week-warning" className="text-sm text-amber-700">
            {item.warning}
          </p>
        ) : null}
      </div>
      {onStatus ? (
        <button
          type="button"
          onClick={() => onStatus(item)}
          aria-label={`Status: ${statusLabel}. Change status for ${item.title}`}
          data-testid={`studio-week-status-${item.assignmentExternalId}`}
          className="shrink-0 rounded-full border border-primary px-3 py-1 text-xs font-semibold text-primary hover:bg-accent"
        >
          <span aria-hidden="true">{STUDENT_STATUS_MARKS[item.studentStatus]}</span> {statusLabel}
        </button>
      ) : (
        <span className="shrink-0 text-xs font-semibold text-primary">
          <span aria-hidden="true">{STUDENT_STATUS_MARKS[item.studentStatus]}</span> {statusLabel}
        </span>
      )}
    </li>
  );
}

function DoneRow({ done }: { readonly done: IWeekDone }): React.ReactElement {
  return (
    <li
      data-testid={`studio-week-done-${done.assignmentExternalId}`}
      className="flex items-center gap-3 py-3"
    >
      <span aria-hidden="true" className="text-green-700">
        ✓
      </span>
      <div className="flex min-w-0 flex-col">
        <Link
          href={`/studio/assignments/${encodeURIComponent(done.assignmentExternalId)}`}
          className="text-base text-foreground/70 line-through hover:underline"
        >
          {done.title}
        </Link>
        <p className="text-sm text-muted-foreground">
          {done.courseName} · {done.confirmedBySchool ? 'Turned in' : 'Marked done'}
        </p>
      </div>
    </li>
  );
}

function formatDue(iso: string | undefined): string {
  if (iso === undefined || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
