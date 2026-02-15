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
  /** True while student is being fetched (getById in progress). */
  studentLoading: boolean;
  /** Set when student fetch failed or returned null (e.g. 'not_found'). */
  studentLoadError: string | null;
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
      studentLoading: false,
      studentLoadError: null,
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
  const [studentLoading, setStudentLoading] = useState(false);
  const [studentLoadError, setStudentLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentIdFromPath) {
      setStudentName(null);
      setStudentExternalId(null);
      setStudentLoadError(null);
      setStudentLoading(false);
      return;
    }
    let cancelled = false;
    setStudentLoading(true);
    setStudentLoadError(null);
    void (async () => {
      try {
        const student = await studentsApi.getById(studentIdFromPath);
        if (cancelled) return;
        if (student) {
          setStudentName(student.name);
          setStudentExternalId(student.studentId ?? null);
          setStudentLoadError(null);
        } else {
          setStudentName(null);
          setStudentExternalId(null);
          setStudentLoadError('not_found');
        }
      } catch {
        if (!cancelled) {
          setStudentName(null);
          setStudentExternalId(null);
          setStudentLoadError('not_found');
        }
      } finally {
        if (!cancelled) setStudentLoading(false);
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
      studentLoading: Boolean(studentIdFromPath && studentLoading),
      studentLoadError: studentIdFromPath ? studentLoadError : null,
      clearStudentView: () => {
        onClear?.();
      },
    };
  }, [studentIdFromPath, studentName, studentExternalId, studentLoading, studentLoadError, onClear]);

  return (
    <StudentViewContext.Provider value={value}>
      {children}
    </StudentViewContext.Provider>
  );
}
