'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { IStudent } from '@/lib/api/students';

export interface StudentOverviewTabProps {
  studentId: string;
  student: IStudent | null;
  name: string;
  grade: string;
  studentIdField: string;
  error: string;
  isSaving: boolean;
  onNameChange: (value: string) => void;
  onGradeChange: (value: string) => void;
  onStudentIdFieldChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function StudentOverviewTab({
  studentId: _studentId, // eslint-disable-line @typescript-eslint/no-unused-vars -- required by interface
  student,
  name,
  grade,
  studentIdField,
  error,
  isSaving,
  onNameChange,
  onGradeChange,
  onStudentIdFieldChange,
  onSubmit,
  onCancel: _onCancel, // eslint-disable-line @typescript-eslint/no-unused-vars -- required by interface
}: StudentOverviewTabProps) {
  return (
    <Card className="max-w-2xl">
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>Student Information</CardTitle>
          <CardDescription>Update the student&apos;s information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div
              className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200"
              data-testid="message-error"
            >
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              name="name"
              data-testid="input-student-name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="grade">Grade</Label>
            <Input
              id="grade"
              name="grade"
              data-testid="input-student-grade"
              type="number"
              placeholder="10"
              min={1}
              max={12}
              value={grade}
              onChange={(e) => onGradeChange(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="studentId">Student ID</Label>
            <Input
              id="studentId"
              name="studentId"
              data-testid="student-external-id"
              type="text"
              placeholder="Optional external ID"
              value={studentIdField}
              onChange={(e) => onStudentIdFieldChange(e.target.value)}
              disabled={isSaving}
            />
          </div>
          {student?.stats && (
            <div className="border-t pt-4 space-y-2">
              <h4 className="font-medium">Stats</h4>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                {student.stats.currentGPA !== undefined && (
                  <p>GPA: {student.stats.currentGPA.toFixed(2)}</p>
                )}
                {student.stats.totalAssignments !== undefined && (
                  <p>Assignments: {student.stats.totalAssignments}</p>
                )}
                {student.stats.missingAssignments !== undefined && (
                  <p>Missing: {student.stats.missingAssignments}</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" type="button" asChild disabled={isSaving}>
            <Link href="/dashboard/students">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSaving} data-testid="button-save-student">
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
