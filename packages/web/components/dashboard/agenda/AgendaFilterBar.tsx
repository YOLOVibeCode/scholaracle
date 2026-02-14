'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { IAgendaItem } from '@/lib/api/agenda';
import { cn } from '@/lib/utils';

export interface AgendaFilterBarProps {
  items: readonly IAgendaItem[];
  selectedLabels: Set<string>;
  selectedStudents: Set<string>;
  onToggleLabel: (label: string) => void;
  onToggleStudent: (student: string) => void;
  onClearFilters: () => void;
}

export function AgendaFilterBar({
  items,
  selectedLabels,
  selectedStudents,
  onToggleLabel,
  onToggleStudent,
  onClearFilters,
}: AgendaFilterBarProps) {
  const { labels, students } = useMemo(() => {
    const labelSet = new Set<string>();
    const studentSet = new Set<string>();
    for (const item of items) {
      for (const l of item.labels ?? []) labelSet.add(l);
      if (item.studentName) studentSet.add(item.studentName);
    }
    return {
      labels: Array.from(labelSet).sort(),
      students: Array.from(studentSet).sort(),
    };
  }, [items]);

  const activeCount = selectedLabels.size + selectedStudents.size;
  const showBar = labels.length > 0 || students.length > 0;

  if (!showBar) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="agenda-filter-bar"
    >
      {students.map((name) => (
        <Button
          key={name}
          variant={selectedStudents.has(name) ? 'default' : 'outline'}
          size="sm"
          onClick={() => onToggleStudent(name)}
          data-testid={`filter-student-${name.replace(/\s+/g, '-')}`}
        >
          {name}
        </Button>
      ))}
      {labels.map((label) => (
        <Button
          key={label}
          variant={selectedLabels.has(label) ? 'default' : 'outline'}
          size="sm"
          onClick={() => onToggleLabel(label)}
          data-testid={`filter-label-${label}`}
          className={cn(
            selectedLabels.has(label) && 'ring-1 ring-offset-1'
          )}
        >
          {label}
        </Button>
      ))}
      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearFilters}
          data-testid="agenda-clear-filters"
        >
          Clear ({activeCount})
        </Button>
      )}
    </div>
  );
}
