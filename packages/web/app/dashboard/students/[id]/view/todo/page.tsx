'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { AlertTriangle, Clock, Loader2, CheckCircle2, HelpCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  studentsApi,
  type IWorkflowAssignment,
  type StudentStatus,
} from '@/lib/api/students';

const STATUS_OPTIONS: { value: StudentStatus; label: string; color: string }[] = [
  { value: 'not_started', label: 'Not Started', color: 'bg-gray-100 text-gray-700' },
  { value: 'working_on_it', label: 'Working On It', color: 'bg-blue-100 text-blue-700' },
  { value: 'need_help', label: 'Need Help', color: 'bg-amber-100 text-amber-700' },
  { value: 'done', label: 'Done', color: 'bg-green-100 text-green-700' },
];

function getStatusColor(status?: string): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.color ?? 'bg-gray-100 text-gray-700';
}

function formatRelativeDue(dueAt?: string): { text: string; urgent: boolean } {
  if (!dueAt) return { text: 'No due date', urgent: false };
  const due = new Date(dueAt);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return { text: `${Math.abs(diffDays)} days overdue`, urgent: true };
  if (diffDays === -1) return { text: 'Due yesterday', urgent: true };
  if (diffDays === 0) return { text: 'Due today', urgent: true };
  if (diffDays === 1) return { text: 'Due tomorrow', urgent: true };
  if (diffDays <= 3) return { text: `Due in ${diffDays} days`, urgent: true };
  if (diffDays <= 7) return { text: `Due in ${diffDays} days`, urgent: false };
  return { text: due.toLocaleDateString(), urgent: false };
}

interface TodoCardProps {
  assignment: IWorkflowAssignment;
  studentId: string;
  isHighlighted: boolean;
}

function TodoCard({ assignment, studentId, isHighlighted }: TodoCardProps) {
  const [currentStatus, setCurrentStatus] = useState(assignment.studentStatus ?? 'not_started');
  const [updating, setUpdating] = useState(false);
  const { text: dueText, urgent } = formatRelativeDue(assignment.dueAt);

  const handleStatusChange = async (value: string) => {
    const newStatus = value as StudentStatus;
    setUpdating(true);
    setCurrentStatus(newStatus);
    await studentsApi.updateAssignmentStatus(studentId, assignment.externalId, newStatus);
    setUpdating(false);
  };

  return (
    <div
      id={`todo-${assignment.externalId}`}
      className={`rounded-lg border p-4 transition-colors ${
        isHighlighted
          ? 'ring-2 ring-blue-500 bg-blue-50/50'
          : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold truncate">{assignment.title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{assignment.courseName}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs ${urgent ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
              {dueText}
            </span>
            {assignment.isMissing && (
              <Badge variant="destructive" className="text-xs px-1.5 py-0">Missing</Badge>
            )}
            {assignment.isLate && !assignment.isMissing && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 bg-amber-100 text-amber-700">Late</Badge>
            )}
            {assignment.percentScore != null && (
              <span className="text-xs text-muted-foreground">
                {assignment.percentScore.toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">
          <Select value={currentStatus} onValueChange={(v) => void handleStatusChange(v)}>
            <SelectTrigger className={`h-7 text-xs w-[130px] ${getStatusColor(currentStatus)}`}>
              <SelectValue />
              {updating && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

interface TodoSectionProps {
  title: string;
  icon: React.ReactNode;
  assignments: readonly IWorkflowAssignment[];
  studentId: string;
  highlightId?: string;
  accentClass: string;
}

function TodoSection({ title, icon, assignments, studentId, highlightId, accentClass }: TodoSectionProps) {
  if (assignments.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className={`text-base flex items-center gap-2 ${accentClass}`}>
          {icon}
          {title}
          <Badge variant="secondary" className="ml-auto">{assignments.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {assignments.map((a) => (
          <TodoCard
            key={a.externalId}
            assignment={a}
            studentId={studentId}
            isHighlighted={a.externalId === highlightId}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function TodoContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const studentId = params.id as string;
  const highlightId = searchParams.get('highlight') ?? undefined;

  const [assignments, setAssignments] = useState<readonly IWorkflowAssignment[]>([]);
  const [studentName, setStudentName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await studentsApi.getAssignmentWorkflow(studentId);
      if (res) {
        setAssignments(res.assignments);
        setStudentName(res.studentName);
      } else {
        setError('Failed to load assignments');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    } finally {
      setIsLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Scroll to highlighted item
  useEffect(() => {
    if (!isLoading && highlightId) {
      const el = document.getElementById(`todo-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [isLoading, highlightId]);

  const { needsAttention, dueSoon, inProgress, recentlyDone } = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const needs: IWorkflowAssignment[] = [];
    const soon: IWorkflowAssignment[] = [];
    const progress: IWorkflowAssignment[] = [];
    const done: IWorkflowAssignment[] = [];

    for (const a of assignments) {
      const ss = a.studentStatus;

      // Done items
      if (ss === 'done' || (a.status === 'graded' && a.gradedAt && new Date(a.gradedAt) > sevenDaysAgo)) {
        done.push(a);
        continue;
      }

      // In progress or need help
      if (ss === 'working_on_it' || ss === 'need_help') {
        progress.push(a);
        continue;
      }

      // Needs attention: missing, late, or overdue
      if (a.isMissing || a.isLate || a.isOverdue) {
        needs.push(a);
        continue;
      }

      // Due soon: within 7 days, not yet submitted/graded
      if (a.dueAt && a.status !== 'submitted' && a.status !== 'graded') {
        const due = new Date(a.dueAt);
        if (due <= sevenDaysOut && due >= now) {
          soon.push(a);
          continue;
        }
      }
    }

    // Sort needs attention by due date (overdue first)
    needs.sort((a, b) => {
      const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return da - db;
    });

    // Sort due soon by due date
    soon.sort((a, b) => {
      const da = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const db = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      return da - db;
    });

    return { needsAttention: needs, dueSoon: soon, inProgress: progress, recentlyDone: done };
  }, [assignments]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">To Do</h1>
          <p className="text-muted-foreground mt-1">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">To Do</h1>
          <p className="text-red-500 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const hasItems = needsAttention.length + dueSoon.length + inProgress.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {studentName ? `${studentName} — To Do` : 'To Do'}
        </h1>
        <p className="text-muted-foreground mt-1">
          {hasItems
            ? 'Here\'s what needs your attention. Update your status as you work.'
            : 'All caught up! No assignments need attention right now.'}
        </p>
      </div>

      {/* Summary badges */}
      <div className="flex gap-3 flex-wrap">
        {needsAttention.length > 0 && (
          <Badge variant="destructive" className="text-sm px-3 py-1">
            {needsAttention.length} need{needsAttention.length === 1 ? 's' : ''} attention
          </Badge>
        )}
        {dueSoon.length > 0 && (
          <Badge className="text-sm px-3 py-1 bg-amber-100 text-amber-700">
            {dueSoon.length} due soon
          </Badge>
        )}
        {inProgress.length > 0 && (
          <Badge className="text-sm px-3 py-1 bg-blue-100 text-blue-700">
            {inProgress.length} in progress
          </Badge>
        )}
        {recentlyDone.length > 0 && (
          <Badge className="text-sm px-3 py-1 bg-green-100 text-green-700">
            {recentlyDone.length} done recently
          </Badge>
        )}
      </div>

      <TodoSection
        title="Needs Attention"
        icon={<AlertTriangle className="h-5 w-5" />}
        assignments={needsAttention}
        studentId={studentId}
        highlightId={highlightId}
        accentClass="text-red-600"
      />

      <TodoSection
        title="Due Soon"
        icon={<Clock className="h-5 w-5" />}
        assignments={dueSoon}
        studentId={studentId}
        highlightId={highlightId}
        accentClass="text-amber-600"
      />

      <TodoSection
        title="In Progress"
        icon={<HelpCircle className="h-5 w-5" />}
        assignments={inProgress}
        studentId={studentId}
        highlightId={highlightId}
        accentClass="text-blue-600"
      />

      <TodoSection
        title="Recently Completed"
        icon={<CheckCircle2 className="h-5 w-5" />}
        assignments={recentlyDone}
        studentId={studentId}
        highlightId={highlightId}
        accentClass="text-green-600"
      />
    </div>
  );
}

export default function StudentTodoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading...</div>}>
      <TodoContent />
    </Suspense>
  );
}
