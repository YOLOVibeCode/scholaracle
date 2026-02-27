'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { studentsApi, type IStudentGradesResponse, type ICourseGrade } from '@/lib/api/students';
import { GradeSidebar } from '@/components/dashboard/students/GradeSidebar';
import { AssignmentTable } from '@/components/dashboard/students/AssignmentTable';
import { CourseGradeSummaryCard } from '@/components/dashboard/students/CourseGradeSummaryCard';

export default function StudentGradesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const studentId = params.id as string;
  const courseParam = searchParams.get('course');

  const [data, setData] = useState<IStudentGradesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGrades = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await studentsApi.getGrades(studentId);
      if (res) setData(res);
      else setError('Failed to load grades');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load grades');
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void loadGrades();
  }, [loadGrades]);

  const courseGrades = data?.courseGrades ?? [];
  const selectedId = courseParam ?? (courseGrades[0]?.courseExternalId ?? null);
  const selectedCourse = selectedId ? courseGrades.find((c) => c.courseExternalId === selectedId) : null;

  const handleSelectCourse = useCallback(
    (courseExternalId: string) => {
      router.replace(`${pathname}?course=${encodeURIComponent(courseExternalId)}`);
    },
    [router, pathname]
  );

  if (loading) {
    return (
      <div className="flex gap-6 p-4">
        <div className="w-32 shrink-0">Loading...</div>
        <div className="flex-1 text-muted-foreground">Loading grades...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-red-600 dark:text-red-400">{error ?? 'Failed to load grades'}</p>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/students/${studentId}`}>Back to student</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 gap-6 p-4" data-testid="student-grades-page">
      <div className="w-32 shrink-0 lg:w-40">
        <GradeSidebar
          courseGrades={courseGrades}
          selectedCourseId={selectedId}
          onSelectCourse={handleSelectCourse}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`/dashboard/students/${studentId}`} data-testid="back-link">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{data.studentName} — Grades</h1>
            <p className="text-muted-foreground text-sm">
              Overall GPA: {data.overallGPA.toFixed(1)}
              {data.atRiskCourses > 0 && ` · ${data.atRiskCourses} course(s) at risk`}
              {' · '}
              <Link
                href={`/dashboard/students/${studentId}?tab=trends`}
                className="text-primary hover:underline"
                data-testid="grades-page-view-trends"
              >
                View trends
              </Link>
            </p>
          </div>
        </div>

        {data.aiOverview && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm" data-testid="grades-ai-overview">
            {data.aiOverview}
          </div>
        )}

        {selectedCourse ? (
          <>
            <CourseGradeSummaryCard course={selectedCourse} studentId={studentId} />
            <div>
              <h2 className="mb-2 text-lg font-semibold">{selectedCourse.courseName} — Assignments</h2>
              <AssignmentTable
                assignments={selectedCourse.assignments}
                courseName={selectedCourse.courseName}
              />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Select a course from the sidebar.</p>
        )}
      </div>
    </div>
  );
}
