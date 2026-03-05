'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { IWorkflowAssignment } from '@/lib/api/students';

export interface WorkflowFilters {
  courseExternalId: string | null;
  statuses: readonly string[];
  category: string | null;
  from: string | null;
  to: string | null;
}

const STATUS_OPTIONS = [
  { id: 'missing', label: 'Missing' },
  { id: 'late', label: 'Late' },
  { id: 'graded', label: 'Graded' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'pending', label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'upcoming', label: 'Upcoming' },
] as const;

export interface WorkflowFilterBarProps {
  assignments: readonly IWorkflowAssignment[];
  filters: WorkflowFilters;
  onFiltersChange: (filters: WorkflowFilters) => void;
}

export function WorkflowFilterBar({
  assignments,
  filters,
  onFiltersChange,
}: WorkflowFilterBarProps) {
  const courses = useMemo(() => {
    const seen = new Set<string>();
    const list: { externalId: string; name: string }[] = [];
    for (const a of assignments) {
      if (a.courseExternalId && !seen.has(a.courseExternalId)) {
        seen.add(a.courseExternalId);
        list.push({ externalId: a.courseExternalId, name: a.courseName });
      }
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [assignments]);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const a of assignments) {
      if (a.category) seen.add(a.category);
    }
    return Array.from(seen).sort();
  }, [assignments]);

  const toggleStatus = (statusId: string) => {
    const set = new Set(filters.statuses);
    if (set.has(statusId)) set.delete(statusId);
    else set.add(statusId);
    onFiltersChange({ ...filters, statuses: Array.from(set) });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid="workflow-filter-bar"
    >
      <Select
        value={filters.courseExternalId ?? 'all'}
        onValueChange={(v) =>
          onFiltersChange({
            ...filters,
            courseExternalId: v === 'all' ? null : v,
          })
        }
      >
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All courses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All courses</SelectItem>
          {courses.map((c) => (
            <SelectItem key={c.externalId} value={c.externalId}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground text-sm">Status:</span>
        {STATUS_OPTIONS.map((opt) => {
          const isUpcoming = opt.id === 'upcoming';
          const active = isUpcoming
            ? filters.statuses.includes('upcoming')
            : filters.statuses.includes(opt.id);
          return (
            <Button
              key={opt.id}
              variant={active ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => toggleStatus(opt.id)}
            >
              {opt.label}
            </Button>
          );
        })}
      </div>

      <Select
        value={filters.category ?? 'all'}
        onValueChange={(v) =>
          onFiltersChange({ ...filters, category: v === 'all' ? null : v })
        }
      >
        <SelectTrigger className="w-[120px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Input
          type="date"
          className="h-8 w-[140px]"
          value={filters.from ?? ''}
          onChange={(e) =>
            onFiltersChange({ ...filters, from: e.target.value || null })
          }
        />
        <span className="text-muted-foreground text-sm">–</span>
        <Input
          type="date"
          className="h-8 w-[140px]"
          value={filters.to ?? ''}
          onChange={(e) =>
            onFiltersChange({ ...filters, to: e.target.value || null })
          }
        />
      </div>
    </div>
  );
}
