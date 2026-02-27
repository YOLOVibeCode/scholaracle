'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import { studentsApi, type IGradeHistoryResponse } from '@/lib/api/students';
import { ErrorDisplay } from '@/components/common';

/** Fixed palette for course lines (8–10 colors). */
const LINE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export interface AllCoursesGradeTrendProps {
  readonly studentId: string;
  readonly from?: string;
  readonly to?: string;
  readonly term?: string;
  /** When set, this course's line is highlighted and scroll target. */
  readonly activeCourseId?: string | null;
  onActiveCourseChange?: (courseExternalId: string | null) => void;
}

interface PivotRow {
  readonly date: string;
  readonly label: string;
  [courseKey: string]: string | number | undefined;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Pivot API response into one row per date, one key per course (by courseExternalId). Exported for tests. */
export function pivotToChartData(res: IGradeHistoryResponse): {
  rows: PivotRow[];
  courseOrder: Array<{ courseExternalId: string; courseName: string }>;
} {
  const dateSet = new Set<string>();
  const courseOrder: Array<{ courseExternalId: string; courseName: string }> = [];
  for (const c of res.courses) {
    courseOrder.push({ courseExternalId: c.courseExternalId, courseName: c.courseName });
    for (const s of c.snapshots) {
      dateSet.add(s.date);
    }
  }
  const sortedDates = Array.from(dateSet).sort();
  const rows: PivotRow[] = sortedDates.map((date) => {
    const row: PivotRow = { date, label: formatDateLabel(date) };
    for (const c of res.courses) {
      const snap = c.snapshots.find((s) => s.date === date);
      const value = snap != null ? Math.round(snap.percentGrade * 10) / 10 : undefined;
      row[c.courseExternalId] = value;
    }
    return row;
  });
  return { rows, courseOrder };
}

export function AllCoursesGradeTrend({
  studentId,
  from,
  to,
  term,
  activeCourseId,
  onActiveCourseChange,
}: AllCoursesGradeTrendProps) {
  const router = useRouter();
  const [response, setResponse] = useState<IGradeHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await studentsApi.getGradeHistory(studentId, undefined, { from, to, term });
      setResponse(res ?? null);
    } catch (e) {
      setResponse(null);
      setError(e instanceof Error ? e.message : 'Failed to load grade history');
    } finally {
      setLoading(false);
    }
  }, [studentId, from, to, term]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const { rows, courseOrder } = useMemo(() => {
    if (!response || response.courses.length === 0) return { rows: [], courseOrder: [] };
    return pivotToChartData(response);
  }, [response]);

  const handleLineClick = useCallback(
    (courseExternalId: string) => {
      onActiveCourseChange?.(courseExternalId);
      router.push(`/dashboard/students/${studentId}/grades?course=${encodeURIComponent(courseExternalId)}`);
    },
    [studentId, router, onActiveCourseChange]
  );

  if (loading) {
    return (
      <div className="h-64 animate-pulse rounded-lg bg-muted/30" data-testid="all-courses-grade-trend-loading" />
    );
  }

  if (error) {
    return (
      <div data-testid="all-courses-grade-trend-error">
        <ErrorDisplay
          error={error}
          title="Couldn't load trend data"
          onRetry={loadHistory}
        />
      </div>
    );
  }

  if (rows.length < 2 || courseOrder.length === 0) {
    return (
      <div
        className="rounded-lg border bg-muted/20 p-4 text-center text-sm text-muted-foreground"
        data-testid="all-courses-grade-trend-empty"
      >
        All-courses trend needs 2+ data points across courses. Run scrapers to build history.
      </div>
    );
  }

  const allValues = rows.flatMap((r) =>
    courseOrder.map((c) => r[c.courseExternalId] as number | undefined).filter((v): v is number => typeof v === 'number')
  );
  const minGrade = allValues.length ? Math.min(...allValues) : 0;
  const maxGrade = allValues.length ? Math.max(...allValues) : 100;
  const yMin = Math.max(0, Math.floor(minGrade / 10) * 10 - 10);
  const yMax = Math.min(110, Math.ceil(maxGrade / 10) * 10 + 10);

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="all-courses-grade-trend">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">All courses trend</h3>
        <span className="text-sm text-muted-foreground">
          {rows.length} dates · {courseOrder.length} courses
        </span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={rows} margin={{ top: 8, right: 20, left: 0, bottom: 8 }}>
          <defs />
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} className="fill-muted-foreground" />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
            }}
            labelFormatter={(label) => label}
            formatter={(value: number | undefined, name) => {
              const course = courseOrder.find((c) => c.courseExternalId === name);
              return [value != null ? `${value}%` : '—', course?.courseName ?? (name as string)];
            }}
          />
          <ReferenceLine
            y={70}
            stroke="#ef4444"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{ value: 'Passing', position: 'insideTopLeft', fill: '#ef4444', fontSize: 11 }}
          />
          <Legend
            wrapperStyle={{ paddingTop: 8 }}
            formatter={(value) => {
              const course = courseOrder.find((c) => c.courseExternalId === value);
              return course?.courseName ?? value;
            }}
          />
          {courseOrder.map((c, i) => {
            const color = LINE_COLORS[i % LINE_COLORS.length];
            const isActive = activeCourseId === c.courseExternalId;
            return (
              <Line
                key={c.courseExternalId}
                type="monotone"
                dataKey={c.courseExternalId}
                name={c.courseExternalId}
                stroke={color}
                strokeWidth={isActive ? 3 : 2}
                dot={{ r: 3, fill: color }}
                activeDot={{ r: 5, strokeWidth: 2 }}
                connectNulls
                onClick={() => handleLineClick(c.courseExternalId)}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
