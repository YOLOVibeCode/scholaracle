'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { studentsApi, type ICourseGrade, type IGradeHistoryResponse, type RiskLevel } from '@/lib/api/students';
import { gradeColorClass, riskBadgeClass } from '@/components/dashboard/students/GradeSidebar';
import { AllCoursesGradeTrend } from '@/components/dashboard/students/AllCoursesGradeTrend';
import { ConfirmDialog } from '@/components/common';
import { ErrorDisplay } from '@/components/common';

const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

export interface StudentTrendsTabProps {
  readonly studentId: string;
}

function TrendIcon({ trend }: { trend: 'improving' | 'stable' | 'declining' }) {
  if (trend === 'improving') return <ArrowUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />;
  if (trend === 'declining') return <ArrowDown className="h-4 w-4 text-red-600 dark:text-red-400" aria-hidden />;
  return <Minus className="h-4 w-4 text-muted-foreground" aria-hidden />;
}

export function StudentTrendsTab({ studentId }: StudentTrendsTabProps) {
  const [grades, setGrades] = useState<readonly ICourseGrade[] | null>(null);
  const [history, setHistory] = useState<IGradeHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [termOption, setTermOption] = useState<string>('all');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [gradesRes, historyRes] = await Promise.all([
        studentsApi.getGrades(studentId),
        studentsApi.getGradeHistory(studentId),
      ]);
      setGrades(gradesRes?.courseGrades ?? null);
      setHistory(historyRes ?? null);
    } catch (e) {
      setGrades(null);
      setHistory(null);
      setLoadError(e instanceof Error ? e.message : 'Failed to load trends');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const termOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All time' }];
    if (history?.courses) {
      const dates = new Set<string>();
      for (const c of history.courses) {
        for (const s of c.snapshots) dates.add(s.date);
      }
      const sorted = Array.from(dates).sort();
      if (sorted.length > 0) {
        const start = sorted[0]!;
        const end = sorted[sorted.length - 1]!;
        const startYear = start.slice(0, 4);
        const endYear = end.slice(0, 4);
        if (startYear !== endYear) {
          opts.push({ value: `${start}_${end}`, label: `${startYear} – ${endYear}` });
        } else {
          opts.push({ value: `${start}_${end}`, label: startYear });
        }
      }
    }
    return opts;
  }, [history]);

  const fromTo = useMemo(() => {
    if (termOption === 'all' || !termOption.includes('_')) return { from: undefined, to: undefined };
    const [from, to] = termOption.split('_');
    return { from, to };
  }, [termOption]);

  const sortedByRisk = useMemo(() => {
    if (!grades) return [];
    return [...grades].sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]);
  }, [grades]);

  const handleArchiveClick = useCallback(() => {
    if (termOption && termOption !== 'all' && termOption.includes('_')) {
      setArchiveConfirmOpen(true);
    }
  }, [termOption]);

  const handleArchiveConfirm = useCallback(async () => {
    if (!termOption || termOption === 'all') return;
    const [, to] = termOption.split('_');
    if (!to) return;
    setArchiveConfirmOpen(false);
    const d = new Date(to + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const beforeStr = d.toISOString().slice(0, 10);
    setArchiveLoading(true);
    try {
      await studentsApi.archiveGradeHistory(studentId, beforeStr);
      await load();
      setTermOption('all');
    } catch {
      setLoadError('Failed to archive. Please try again.');
    } finally {
      setArchiveLoading(false);
    }
  }, [studentId, termOption, load]);

  const archiveConfirmLabel = termOptions.find((o) => o.value === termOption)?.label ?? 'this period';

  if (loading) {
    return (
      <div className="py-8 text-center text-muted-foreground" data-testid="trends-tab-loading">
        Loading trends...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4" data-testid="student-trends-tab">
        <div data-testid="trends-tab-error">
          <ErrorDisplay error={loadError} title="Failed to load trends" onRetry={load} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="student-trends-tab">
      <ConfirmDialog
        isOpen={archiveConfirmOpen}
        title="Archive grade history?"
        description={`Grade history for ${archiveConfirmLabel} will be moved to archive. You can still access it later. Continue?`}
        confirmLabel="Archive"
        cancelLabel="Cancel"
        variant="destructive"
        isSubmitting={archiveLoading}
        onConfirm={handleArchiveConfirm}
        onCancel={() => setArchiveConfirmOpen(false)}
      />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Term:</span>
          <select
            value={termOption}
            onChange={(e) => setTermOption(e.target.value)}
            className="rounded border bg-background px-2 py-1.5 text-sm"
            data-testid="trends-term-select"
          >
            {termOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {termOption !== 'all' && termOptions.length > 1 && (
          <button
            type="button"
            onClick={handleArchiveClick}
            disabled={archiveLoading}
            className="rounded border border-amber-500 bg-amber-50 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
            data-testid="trends-archive-button"
            aria-label="Archive semester grade history"
          >
            {archiveLoading ? 'Archiving…' : 'Archive semester'}
          </button>
        )}
      </div>

      {sortedByRisk.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="trends-risk-cards">
          {sortedByRisk.map((course) => {
            const isActive = activeCourseId === course.courseExternalId;
            const colorClass = gradeColorClass(course.grade, course.riskLevel);
            const badgeClass = riskBadgeClass(course.riskLevel);
            const showBadge = ['critical', 'high', 'medium'].includes(course.riskLevel);
            return (
              <button
                type="button"
                key={course.courseExternalId}
                onClick={() => setActiveCourseId(course.courseExternalId)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                  isActive ? 'ring-2 ring-primary' : ''
                }`}
                data-testid={`trends-risk-card-${course.courseExternalId}`}
              >
                <span className="font-medium truncate max-w-[120px]" title={course.courseName}>
                  {course.courseName}
                </span>
                <span className={`tabular-nums font-semibold ${colorClass}`}>{course.grade}</span>
                <TrendIcon trend={course.recentTrend} />
                {showBadge && (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${badgeClass}`}>
                    {course.riskLevel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <AllCoursesGradeTrend
        studentId={studentId}
        from={fromTo.from}
        to={fromTo.to}
        activeCourseId={activeCourseId}
        onActiveCourseChange={setActiveCourseId}
      />
    </div>
  );
}
