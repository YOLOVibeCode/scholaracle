'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { studentsApi, type IActivityTimelineFilters } from '@/lib/api/students';
import { useAsyncData } from '@/lib/hooks';
import { ActivityTimeline } from '@/components/dashboard/students/ActivityTimeline';

const EVENT_TYPE_OPTIONS = [
  { id: 'grade_change', label: 'Grade changes' },
  { id: 'material_added', label: 'Materials added' },
  { id: 'material_removed', label: 'Materials removed' },
  { id: 'material_updated', label: 'Materials updated' },
  { id: 'alert_created', label: 'Alerts' },
  { id: 'comment_added', label: 'Comments' },
  { id: 'grade_snapshot', label: 'Grade snapshots' },
] as const;

export interface StudentActivityTabProps {
  readonly studentId: string;
}

export function StudentActivityTab({ studentId }: StudentActivityTabProps) {
  const [course, setCourse] = useState<string>('');
  const [types, setTypes] = useState<readonly string[]>([]);
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const filterRef = useRef(false);

  const filters: IActivityTimelineFilters = useMemo(
    () => ({
      course: course || undefined,
      types: types.length > 0 ? types : undefined,
      from: from || undefined,
      to: to || undefined,
      limit: 100,
    }),
    [course, types, from, to]
  );

  const { data, isLoading, error, retry, refresh } = useAsyncData(
    () => studentsApi.getActivityTimeline(studentId, filters),
    { retryCount: 1 }
  );

  const typesKey = types.join(',');
  useEffect(() => {
    if (!filterRef.current) {
      filterRef.current = true;
      return;
    }
    refresh();
  }, [filters.course, filters.from, filters.to, typesKey, refresh]);

  const events = data?.events ?? [];
  const summary = useMemo(() => {
    const gradeChange = events.filter((e) => e.eventType === 'grade_change').length;
    const material = events.filter((e) =>
      ['material_added', 'material_removed', 'material_updated'].includes(e.eventType)
    ).length;
    const alerts = events.filter((e) => e.eventType === 'alert_created').length;
    const comments = events.filter((e) => e.eventType === 'comment_added').length;
    return { gradeChange, material, alerts, comments };
  }, [events]);

  const toggleType = useCallback((id: string) => {
    setTypes((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  }, []);

  return (
    <div className="space-y-4" data-testid="student-activity-tab">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 p-3">
        <span className="text-sm font-medium">Summary:</span>
        <span className="text-sm text-muted-foreground">
          {summary.gradeChange} grade change{summary.gradeChange !== 1 ? 's' : ''}
        </span>
        <span className="text-sm text-muted-foreground">
          {summary.material} material event{summary.material !== 1 ? 's' : ''}
        </span>
        <span className="text-sm text-muted-foreground">
          {summary.alerts} alert{summary.alerts !== 1 ? 's' : ''}
        </span>
        <span className="text-sm text-muted-foreground">
          {summary.comments} comment{summary.comments !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={course || 'all'} onValueChange={(v) => setCourse(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All courses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All courses</SelectItem>
            {/* Course list could be loaded from workflow or grades; for now filter is applied server-side with course param */}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPE_OPTIONS.map((opt) => {
            const active = types.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                className={`rounded px-2 py-1 text-xs ${active ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                onClick={() => toggleType(opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <Input
          type="date"
          className="w-[140px]"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="date"
          className="w-[140px]"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
      </div>

      {error && (
        <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
          <button type="button" className="ml-2 underline" onClick={() => retry()}>
            Retry
          </button>
        </div>
      )}

      <ActivityTimeline
        events={events}
        loading={isLoading}
        emptyMessage="No activity in this range."
        maxHeight="60vh"
      />
    </div>
  );
}
