'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { studentsApi, type IStudent } from '@/lib/api/students';
import { StudentOverviewTab } from '@/components/dashboard/students/StudentOverviewTab';
import { StudentDataSourcesTab } from '@/components/dashboard/students/StudentDataSourcesTab';
import { StudentAlertsTab } from '@/components/dashboard/students/StudentAlertsTab';
import { StudentGradesTab } from '@/components/dashboard/students/StudentGradesTab';
import { ConnectSourceWizard } from '@/components/dashboard/students/ConnectSourceWizard';
import { ManageParentsCard } from '@/components/dashboard/students/ManageParentsCard';

type TabId = 'overview' | 'sources' | 'alerts' | 'grades' | 'parents';

export default function EditStudentPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.id as string;

  const [student, setStudent] = useState<IStudent | null>(null);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [studentIdField, setStudentIdField] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [connectWizardOpen, setConnectWizardOpen] = useState(false);

  useEffect(() => {
    void loadStudent();
  }, [studentId]);

  const loadStudent = async () => {
    if (!studentId) return;
    setIsLoading(true);
    try {
      const data = await studentsApi.getById(studentId);
      if (data) {
        setStudent(data);
        setName(data.name);
        setGrade(data.grade ?? '');
        setStudentIdField(data.studentId ?? data.school ?? '');
      } else {
        setError('Student not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);
    try {
      const result = await studentsApi.update(studentId, {
        name,
        grade: grade || undefined,
        studentId: studentIdField || undefined,
      });
      if (result) {
        setStudent(result);
        router.push('/dashboard/students');
      } else {
        setError('Failed to update student');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveOverrides = async (prefs: {
    useCustomSettings?: boolean;
    gradeDrop?: number;
    lowGradeThreshold?: number;
    frequency?: string;
  }) => {
    const result = await studentsApi.update(studentId, {
      alertPreferences: {
        useCustomSettings: prefs.useCustomSettings,
        gradeDrop: prefs.gradeDrop,
        lowGradeThreshold: prefs.lowGradeThreshold,
        frequency: prefs.frequency,
      },
    });
    if (result) setStudent(result);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12 text-gray-600 dark:text-gray-400">Loading student...</div>
      </div>
    );
  }

  if (error && !student) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400">{error}</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/dashboard/students">Back to Students</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/students" data-testid="back-link">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{student?.name ?? 'Student'}</h1>
          <p className="text-gray-600 dark:text-gray-400">
            {student?.grade ? `Grade ${student.grade}` : 'Update student information'}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild data-testid="button-view-as-student">
          <Link href={`/dashboard/students/${studentId}/view`}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            View as student
          </Link>
        </Button>
      </div>

      <div role="tablist" aria-label="Student sections" className="flex gap-2" data-testid="student-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          data-testid="tab-overview"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'sources'}
          data-testid="tab-sources"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveTab('sources')}
        >
          Data Sources
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'alerts'}
          data-testid="tab-alerts"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveTab('alerts')}
        >
          Alerts
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'grades'}
          data-testid="tab-grades"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveTab('grades')}
        >
          Grades
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'parents'}
          data-testid="tab-parents"
          className="px-3 py-2 rounded border"
          onClick={() => setActiveTab('parents')}
        >
          Parents
        </button>
      </div>

      {activeTab === 'overview' && (
        <StudentOverviewTab
          studentId={studentId}
          student={student}
          name={name}
          grade={grade}
          studentIdField={studentIdField}
          error={error}
          isSaving={isSaving}
          onNameChange={setName}
          onGradeChange={setGrade}
          onStudentIdFieldChange={setStudentIdField}
          onSubmit={handleSubmit}
          onCancel={() => router.push('/dashboard/students')}
        />
      )}

      {activeTab === 'sources' && (
        <StudentDataSourcesTab
          studentId={studentId}
          onConnectSource={() => setConnectWizardOpen(true)}
        />
      )}

      {activeTab === 'alerts' && (
        <StudentAlertsTab
          studentId={studentId}
          student={student}
          onSaveOverrides={handleSaveOverrides}
        />
      )}

      {activeTab === 'grades' && <StudentGradesTab studentId={studentId} />}

      {activeTab === 'parents' && student && (
        <ManageParentsCard
          studentId={studentId}
          studentName={student.name}
          isOwner={true}
        />
      )}

      <ConnectSourceWizard
        open={connectWizardOpen}
        studentId={studentId}
        onClose={() => setConnectWizardOpen(false)}
        onConnected={loadStudent}
      />
    </div>
  );
}
