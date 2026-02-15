'use client';

import { cn } from '@/lib/utils';
import type { IStudent } from '@/lib/api/students';

/** Thin height per item in rem (~100px at 16px base). Responsive. */
const STRIP_ITEM_MIN_HEIGHT_REM = 6.25;

export interface StudentStripProps {
  students: readonly IStudent[];
  selectedId: string | null;
  onSelect: (student: IStudent) => void;
  /** Optional label for the strip (e.g. "Students"). */
  label?: string;
  className?: string;
}

/**
 * A thin, responsive list of students with name on top. Drives the view:
 * selecting a student shows that student's content elsewhere.
 * Item height is rem-based (~6.25rem) so it scales with font size.
 */
export function StudentStrip({
  students,
  selectedId,
  onSelect,
  label,
  className,
}: StudentStripProps) {
  return (
    <nav
      aria-label={label ?? 'Students'}
      className={cn('flex flex-col', className)}
      data-testid="student-strip"
    >
      {label && (
        <h2 className="mb-2 text-sm font-medium text-muted-foreground" id="student-strip-label">
          {label}
        </h2>
      )}
      <ul
        className="flex min-w-0 flex-1 flex-col gap-1"
        role="listbox"
        aria-labelledby={label ? 'student-strip-label' : undefined}
        aria-multiselectable={false}
      >
        {students.map((student) => {
          const isSelected = selectedId === student.id;
          return (
            <li key={student.id} role="option" aria-selected={isSelected}>
              <button
                type="button"
                onClick={() => onSelect(student)}
                className={cn(
                  'flex min-h-[var(--student-strip-item-height)] w-full flex-col justify-center rounded-lg border px-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent bg-muted/50 hover:bg-muted'
                )}
                style={{ ['--student-strip-item-height' as string]: `${STRIP_ITEM_MIN_HEIGHT_REM}rem` }}
                data-testid={`student-strip-item-${student.id}`}
                data-state={isSelected ? 'selected' : 'none'}
              >
                <span className="truncate text-sm font-medium leading-tight" title={student.name}>
                  {student.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
