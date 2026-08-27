'use client';

import { useCallback, useEffect, useState } from 'react';
import { studentsApi } from '@/lib/api/students';
import { studentLoginApi } from '@/lib/api/studentLogin';
import { StudentLoginsCard, type IStudentLoginRow } from './StudentLoginsCard';

export function StudentLoginsSection() {
  const [students, setStudents] = useState<readonly IStudentLoginRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    const list = await studentsApi.getAll();
    const rows = await Promise.all(
      list.map(async (student): Promise<IStudentLoginRow> => ({
        id: student.id,
        name: student.name,
        login: await studentLoginApi.get(student.id),
      }))
    );
    setStudents(rows);
  }, []);

  useEffect(() => {
    void reload().catch(() => {
      setError('Could not load student logins.');
    });
  }, [reload]);

  if (error !== null) {
    return (
      <p className="text-sm text-destructive" data-testid="student-logins-error">
        {error}
      </p>
    );
  }

  return (
    <StudentLoginsCard
      students={students}
      onInvite={async (studentId, email) => {
        const result = await studentLoginApi.invite(studentId, email);
        await reload();
        return result;
      }}
      onRevoke={async (studentId) => {
        await studentLoginApi.revoke(studentId);
        await reload();
      }}
      onShowGradesChange={async (studentId, showGrades) => {
        await studentLoginApi.setShowGrades(studentId, showGrades);
        await reload();
      }}
      onIssueIpadLink={async (studentId) => studentLoginApi.issueMagicLink(studentId)}
    />
  );
}
