'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, GraduationCap, Edit, Trash2, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { studentsApi, type IStudent } from '@/lib/api/students';
import { ConfirmDialog, ErrorDisplay } from '@/components/common';
import { AddStudentWizard } from '@/components/dashboard/AddStudentWizard';

export default function StudentsPage() {
  const [students, setStudents] = useState<readonly IStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    void loadStudents();
  }, []);

  const loadStudents = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const data = await studentsApi.getAll();
      setStudents(data);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to load students');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setDeleteStudentId(id);
  };

  const confirmDelete = async () => {
    if (!deleteStudentId) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      const success = await studentsApi.delete(deleteStudentId);
      if (success) {
        void loadStudents();
      } else {
        setActionError('Failed to delete student');
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete student');
    } finally {
      setIsDeleting(false);
      setDeleteStudentId(null);
    }
  };

  const cancelDelete = () => {
    setDeleteStudentId(null);
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <ErrorDisplay error={actionError} title="Error" onRetry={() => void loadStudents()} />
      )}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Students</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your students</p>
        </div>
        <Button data-testid="button-add-student" onClick={() => setWizardOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Student
        </Button>
      </div>

      {isLoading ? (
        <div
          className="text-center py-12 text-gray-600 dark:text-gray-400"
          data-testid="student-list"
        >
          Loading students...
        </div>
      ) : students.length === 0 ? (
        <Card data-testid="empty-state">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GraduationCap className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No students yet</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Get started by adding your first student and connecting their grade portal
            </p>
            <Button data-testid="button-add-student" onClick={() => setWizardOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Student
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="student-list">
          {students.map((student) => (
            <Card key={student.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle>{student.name}</CardTitle>
                    <CardDescription>
                      {student.grade ? `Grade ${student.grade}` : 'No grade specified'}
                    </CardDescription>
                  </div>
                  <GraduationCap className="h-5 w-5 text-gray-400" />
                </div>
              </CardHeader>
              <CardContent>
                {student.stats && (
                  <div className="space-y-2 text-sm">
                    {student.stats.currentGPA !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">GPA:</span>
                        <span className="font-medium">{student.stats.currentGPA.toFixed(2)}</span>
                      </div>
                    )}
                    {student.stats.totalAssignments !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Assignments:</span>
                        <span className="font-medium">{student.stats.totalAssignments}</span>
                      </div>
                    )}
                    {student.stats.missingAssignments !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">Missing:</span>
                        <span className="font-medium text-red-600">
                          {student.stats.missingAssignments}
                        </span>
                      </div>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-4">
                  <Button variant="outline" size="sm" asChild data-testid="button-view-as-student">
                    <Link href={`/dashboard/students/${student.id}/view`}>
                      <LayoutDashboard className="mr-2 h-4 w-4" />
                      View as student
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild data-testid="button-edit-student">
                    <Link href={`/dashboard/students/${student.id}`} data-testid="student-link">
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteClick(student.id)}
                    className="text-red-600 hover:text-red-700"
                    data-testid="button-delete-student"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteStudentId !== null}
        title="Delete Student"
        description="Are you sure you want to delete this student? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isSubmitting={isDeleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      <AddStudentWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onStudentAdded={() => void loadStudents()}
      />
    </div>
  );
}

