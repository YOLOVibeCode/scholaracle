'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { studentsApi, type IStudent } from '@/lib/api/students';
import { settingsApi } from '@/lib/api/settings';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay } from '@/components/common';
import { StudentGradePanel, type GradeDisplayMode } from '@/components/dashboard/StudentGradePanel';
import { StudentStrip } from '@/components/dashboard/StudentStrip';

export default function CoursesPage() {
  const [gradeDisplayMode, setGradeDisplayMode] = useState<GradeDisplayMode>('letter');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  useEffect(() => {
    void settingsApi.get().then((settings) => {
      const mode = settings.dashboard?.gradeDisplay ?? 'letter';
      setGradeDisplayMode(mode as GradeDisplayMode);
    });
  }, []);

  const handleGradeDisplayToggle = () => {
    const next: GradeDisplayMode = gradeDisplayMode === 'letter' ? 'score' : 'letter';
    setGradeDisplayMode(next);
    void settingsApi.update({ dashboard: { gradeDisplay: next } });
  };

  const fetchStudentsAndGrades = useCallback(async () => {
    const students = await studentsApi.getAll();
    const grades = await Promise.all(students.map((s) => studentsApi.getGrades(s.id)));
    return { students, grades };
  }, []);

  const { data: studentsAndGrades, isLoading, error, retry } = useAsyncData(
    fetchStudentsAndGrades,
    { retryCount: 2, retryDelay: 1000 }
  );

  const students = studentsAndGrades?.students ?? [];
  const grades = studentsAndGrades?.grades ?? [];

  const selectedStudent = useMemo(
    () => (selectedStudentId ? students.find((s) => s.id === selectedStudentId) ?? null : null),
    [students, selectedStudentId]
  );
  const selectedGradesIndex = selectedStudent ? students.findIndex((s) => s.id === selectedStudent.id) : -1;
  const selectedGrades = selectedGradesIndex >= 0 ? grades[selectedGradesIndex] ?? null : null;

  useEffect(() => {
    if (students.length > 0 && !selectedStudentId) setSelectedStudentId(students[0].id);
  }, [students, selectedStudentId]);

  const handleSelectStudent = (student: IStudent) => setSelectedStudentId(student.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4" data-testid="courses-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Courses</h1>
          <p className="text-muted-foreground">
            Grades and courses by student. Select a student to see their courses.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGradeDisplayToggle}
          data-testid="grade-display-toggle"
          aria-pressed={gradeDisplayMode === 'score'}
          aria-label={gradeDisplayMode === 'letter' ? 'Show numeric score' : 'Show letter grade'}
        >
          {gradeDisplayMode === 'letter' ? 'Show score' : 'Show letter'}
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-[minmax(0,12rem)_1fr]">
          <div className="h-[6.25rem] w-full animate-pulse rounded-lg bg-muted md:w-48" />
          <StudentGradePanel
            student={{ id: '', userId: '', name: '…', grade: '' }}
            grades={null}
            loading
            displayMode={gradeDisplayMode}
          />
        </div>
      )}
      {error && !isLoading && (
        <Card>
          <CardContent className="pt-6">
            <ErrorDisplay error={error} title="Failed to load courses" onRetry={retry} />
          </CardContent>
        </Card>
      )}
      {!isLoading && !error && students.length > 0 && (
        <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-1 md:grid-cols-[minmax(0,12rem)_1fr] md:items-start">
          <div className="shrink-0 md:sticky md:top-4">
            <StudentStrip
              students={students}
              selectedId={selectedStudentId}
              onSelect={handleSelectStudent}
              label="Students"
              className="w-full md:w-48"
            />
          </div>
          <div className="min-w-0">
            {selectedStudent && (
              <StudentGradePanel
                key={selectedStudent.id}
                student={selectedStudent}
                grades={selectedGrades}
                displayMode={gradeDisplayMode}
              />
            )}
          </div>
        </div>
      )}
      {!isLoading && !error && students.length === 0 && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Add a student to see their courses and grades here.</p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/dashboard/students/new">Add student</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


