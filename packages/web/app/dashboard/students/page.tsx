'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, GraduationCap, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { studentsApi, type IStudent } from '@/lib/api/students';

export default function StudentsPage() {
  const [students, setStudents] = useState<readonly IStudent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadStudents();
  }, []);

  const loadStudents = async () => {
    setIsLoading(true);
    try {
      const data = await studentsApi.getAll();
      setStudents(data);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to load students:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this student?')) {
      const success = await studentsApi.delete(id);
      if (success) {
        void loadStudents();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Students</h1>
          <p className="text-gray-600 dark:text-gray-400">Manage your students</p>
        </div>
        <Button asChild>
          <Link href="/dashboard/students/new">
            <Plus className="mr-2 h-4 w-4" />
            Add Student
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-600 dark:text-gray-400">Loading students...</div>
      ) : students.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GraduationCap className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No students yet</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Get started by adding your first student
            </p>
            <Button asChild>
              <Link href="/dashboard/students/new">
                <Plus className="mr-2 h-4 w-4" />
                Add Student
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/dashboard/students/${student.id}`}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(student.id)}
                    className="text-red-600 hover:text-red-700"
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
    </div>
  );
}

