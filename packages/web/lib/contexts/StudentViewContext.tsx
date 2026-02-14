'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { studentsApi } from '@/lib/api/students';

export interface StudentViewValue {
  /** Internal student document id (from students collection). */
  studentId: string | null;
  studentName: string | null;
  /** External id (e.g. SLC) for filtering agenda by student. */
  studentExternalId: string | null;
  isStudentView: boolean;
  /** Clear student view and go back to parent dashboard. */
  clearStudentView: () => void;
}

const StudentViewContext = createContext<StudentViewValue | null>(null);

export function useStudentView(): StudentViewValue {
  const ctx = useContext(StudentViewContext);
  if (!ctx) {
    return {
      studentId: null,
      studentName: null,
      studentExternalId: null,
      isStudentView: false,
      clearStudentView: () => {},
    };
  }
  return ctx;
}

export interface StudentViewProviderProps {
  /** When pathname matches student view, this id is extracted and student is loaded. */
  studentIdFromPath: string | null;
  children: ReactNode;
  /** Called when provider needs to clear view (e.g. navigate to /dashboard). */
  onClear?: () => void;
}

export function StudentViewProvider({
  studentIdFromPath,
  children,
  onClear,
}: StudentViewProviderProps) {
  const [studentName, setStudentName] = useState<string | null>(null);
  const [studentExternalId, setStudentExternalId] = useState<string | null>(null);

  useEffect(() => {
    if (!studentIdFromPath) {
      setStudentName(null);
      setStudentExternalId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const student = await studentsApi.getById(studentIdFromPath);
        if (!cancelled && student) {
          setStudentName(student.name);
          setStudentExternalId(student.studentId ?? null);
        } else if (!cancelled) {
          setStudentName('Student');
          setStudentExternalId(null);
        }
      } catch {
        if (!cancelled) {
          setStudentName('Student');
          setStudentExternalId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentIdFromPath]);

  const value = useMemo<StudentViewValue>(() => {
    const isStudentView = Boolean(studentIdFromPath);
    return {
      studentId: studentIdFromPath,
      studentName: studentIdFromPath ? studentName : null,
      studentExternalId: studentIdFromPath ? studentExternalId : null,
      isStudentView,
      clearStudentView: () => {
        onClear?.();
      },
    };
  }, [studentIdFromPath, studentName, studentExternalId, onClear]);

  return (
    <StudentViewContext.Provider value={value}>
      {children}
    </StudentViewContext.Provider>
  );
}
