'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { studentsApi } from '@/lib/api/students';

interface GradeTrendChartProps {
  studentId: string;
  courseExternalId: string;
  courseName: string;
}

interface ChartDataPoint {
  date: string;
  label: string;
  grade: number;
  provider: string;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function gradeColor(grade: number): string {
  if (grade >= 80) return '#10b981';
  if (grade >= 70) return '#f59e0b';
  if (grade >= 60) return '#f97316';
  return '#ef4444';
}

export function GradeTrendChart({ studentId, courseExternalId, courseName }: GradeTrendChartProps) {
  void courseName; // reserved for future use (e.g. chart title)
  const [data, setData] = useState<ChartDataPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await studentsApi.getGradeHistory(studentId, courseExternalId);
      if (!res) return;
      const course = res.courses.find((c) => c.courseExternalId === courseExternalId);
      if (!course || course.snapshots.length === 0) return;

      const points: ChartDataPoint[] = course.snapshots.map((s) => ({
        date: s.date,
        label: formatDateLabel(s.date),
        grade: Math.round(s.percentGrade * 10) / 10,
        provider: s.provider,
      }));
      setData(points);
    } catch {
      // silently fail — chart just won't render
    } finally {
      setLoading(false);
    }
  }, [studentId, courseExternalId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  if (loading) {
    return (
      <div className="h-48 animate-pulse rounded-lg bg-muted/30" />
    );
  }

  if (data.length < 2) {
    return (
      <div className="rounded-lg border bg-muted/20 p-4 text-center text-sm text-muted-foreground">
        Grade trend chart will appear after 2+ scraper runs.
        <br />
        <span className="text-xs">
          {data.length === 1
            ? `First data point recorded: ${data[0]!.label} — ${data[0]!.grade}%`
            : 'No grade history data yet.'}
        </span>
      </div>
    );
  }

  const latestGrade = data[data.length - 1]!.grade;
  const minGrade = Math.min(...data.map((d) => d.grade));
  const maxGrade = Math.max(...data.map((d) => d.grade));
  const yMin = Math.max(0, Math.floor(minGrade / 10) * 10 - 10);
  const yMax = Math.min(110, Math.ceil(maxGrade / 10) * 10 + 10);

  return (
    <div className="rounded-lg border bg-card p-4" data-testid="grade-trend-chart">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Grade Trend</h3>
        <span className="text-sm text-muted-foreground">
          {data.length} data points · {data[0]!.label} — {data[data.length - 1]!.label}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12 }}
            className="fill-muted-foreground"
          />
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
            formatter={(value: number | undefined) => [value != null ? `${value}%` : '—', 'Grade']}
          />
          <ReferenceLine
            y={70}
            stroke="#ef4444"
            strokeDasharray="4 4"
            strokeOpacity={0.5}
            label={{ value: 'Passing', position: 'insideTopLeft', fill: '#ef4444', fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="grade"
            stroke={gradeColor(latestGrade)}
            strokeWidth={2.5}
            dot={{ r: 4, fill: gradeColor(latestGrade) }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
