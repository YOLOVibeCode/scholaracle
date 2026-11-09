'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { StudentAccess } from '@scholaracle/contracts';
import { ArrowLeft, LayoutDashboard, ListTodo, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { studentsApi, type IStudent } from '@/lib/api/students';
import { sharingApi } from '@/lib/api/sharing';
import { getSessionUser, type ISessionUser } from '@/lib/auth/sessionUser';
import { canEditStudent, canManagePeople, canManageSources } from '@/lib/sharing/access';
import { StudentOverviewTab } from '@/components/dashboard/students/StudentOverviewTab';
import { StudentDataSourcesTab } from '@/components/dashboard/students/StudentDataSourcesTab';
import { StudentAlertsTab } from '@/components/dashboard/students/StudentAlertsTab';
import { StudentActivityTab } from '@/components/dashboard/students/StudentActivityTab';
import { StudentGradesTab } from '@/components/dashboard/students/StudentGradesTab';
import { ConnectSourceWizard } from '@/components/dashboard/students/ConnectSourceWizard';
import { FamilyCard } from '@/components/dashboard/sharing/FamilyCard';
import { ShareDialog } from '@/components/dashboard/sharing/ShareDialog';
import { SharedWithYouLine } from '@/components/dashboard/sharing/SharedWithYouLine';
import { StudentDocumentsTab } from '@/components/dashboard/students/StudentDocumentsTab';
import { StudentTrendsTab } from '@/components/dashboard/students/StudentTrendsTab';

type TabId = 'overview' | 'sources' | 'alerts' | 'activity' | 'grades' | 'documents' | 'parents' | 'trends';

const VALID_TABS: TabId[] = ['overview', 'sources', 'alerts', 'activity', 'grades', 'documents', 'parents', 'trends'];

/** Tab ids stay stable (`?tab=parents`, `data-testid="tab-parents"`); only the label changed. */
const TAB_LABELS: Record<TabId, string> = {
  overview: 'Overview',
  sources: 'Data Sources',
  alerts: 'Alerts',
  activity: 'Activity',
  grades: 'Grades',
  documents: 'Documents',
  parents: 'Family & guardians',
  trends: 'Trends',
};

export default function EditStudentPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
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
  const [shareOpen, setShareOpen] = useState(false);
  const [familyRefresh, setFamilyRefresh] = useState(0);
  const [viewer, setViewer] = useState<ISessionUser | null>(null);
  const [sharedBy, setSharedBy] = useState<{ userId: string; name?: string } | null>(null);

  // The API always sends `access`; older cached responses without it belong to the owner.
  const access: StudentAccess = student?.access ?? 'owner';

  useEffect(() => {
    setViewer(getSessionUser());
  }, []);

  const loadStudent = useCallback(async () => {
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
  }, [studentId]);

  useEffect(() => {
    void loadStudent();
  }, [loadStudent]);

  // Who shared this student with the viewer (name for the owner row and the badge).
  useEffect(() => {
    if (!student || student.access === 'owner') {
      setSharedBy(null);
      return;
    }
    let cancelled = false;
    void sharingApi
      .mine()
      .then((view) => {
        if (cancelled) return;
        const mine = view.students.find((s) => s.studentId === student.id);
        setSharedBy(mine?.invitedBy ?? null);
      })
      .catch(() => {
        if (!cancelled) setSharedBy(null);
      });
    return () => {
      cancelled = true;
    };
  }, [student]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && (VALID_TABS as readonly string[]).includes(tab)) {
      setActiveTab(tab as TabId);
    }
  }, [searchParams]);

  const setActiveTabWithUrl = (tab: TabId) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', tab);
    router.replace(`/dashboard/students/${studentId}?${next.toString()}`, { scroll: false });
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
    try {
      const result = await studentsApi.update(studentId, {
        alertPreferences: {
          useCustomSettings: prefs.useCustomSettings,
          gradeDrop: prefs.gradeDrop,
          lowGradeThreshold: prefs.lowGradeThreshold,
          frequency: prefs.frequency,
        },
      });
      if (result) setStudent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save alert settings');
    }
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

  const ownerName =
    sharedBy && student && sharedBy.userId === student.userId ? sharedBy.name : undefined;

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
            {student?.grade
              ? `Grade ${student.grade}`
              : canEditStudent(access)
                ? 'Update student information'
                : 'Student information'}
          </p>
          <SharedWithYouLine access={student?.access} sharedByName={sharedBy?.name} />
        </div>
        {canManagePeople(access) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShareOpen(true)}
            data-testid="button-share-student"
          >
            <UserPlus className="mr-2 h-4 w-4" />
            Share
          </Button>
        )}
        <Button variant="outline" size="sm" asChild data-testid="button-workflow">
          <Link href={`/dashboard/students/${studentId}/workflow`}>
            <ListTodo className="mr-2 h-4 w-4" />
            Workflow
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild data-testid="button-view-as-student">
          <Link href={`/dashboard/students/${studentId}/view`}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            View as student
          </Link>
        </Button>
      </div>

      <div role="tablist" aria-label="Student sections" className="flex flex-wrap gap-2" data-testid="student-tabs">
        {VALID_TABS.map((tabId) => {
          const isActive = activeTab === tabId;
          const panelId = `tabpanel-${tabId}`;
          const tabIdAttr = `tab-${tabId}`;
          return (
            <button
              key={tabId}
              id={tabIdAttr}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={panelId}
              data-testid={`tab-${tabId}`}
              className={`px-3 py-2 rounded border transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background hover:bg-muted/50'
              }`}
              onClick={() => setActiveTabWithUrl(tabId)}
            >
              {TAB_LABELS[tabId]}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div id="tabpanel-overview" role="tabpanel" aria-labelledby="tab-overview">
          <StudentOverviewTab
            studentId={studentId}
            student={student}
            name={name}
            grade={grade}
            studentIdField={studentIdField}
            error={error}
            isSaving={isSaving}
            readOnly={!canEditStudent(access)}
            onNameChange={setName}
            onGradeChange={setGrade}
            onStudentIdFieldChange={setStudentIdField}
            onSubmit={handleSubmit}
            onCancel={() => router.push('/dashboard/students')}
          />
        </div>
      )}

      {activeTab === 'sources' && (
        <div id="tabpanel-sources" role="tabpanel" aria-labelledby="tab-sources">
          <StudentDataSourcesTab
            studentId={studentId}
            canManageSources={canManageSources(access)}
            onConnectSource={() => setConnectWizardOpen(true)}
          />
        </div>
      )}

      {activeTab === 'alerts' && (
        <div id="tabpanel-alerts" role="tabpanel" aria-labelledby="tab-alerts">
          <StudentAlertsTab
            studentId={studentId}
            student={student}
            onSaveOverrides={handleSaveOverrides}
          />
        </div>
      )}

      {activeTab === 'activity' && (
        <div id="tabpanel-activity" role="tabpanel" aria-labelledby="tab-activity">
          <StudentActivityTab studentId={studentId} />
        </div>
      )}

      {activeTab === 'grades' && (
        <div id="tabpanel-grades" role="tabpanel" aria-labelledby="tab-grades">
          <StudentGradesTab studentId={studentId} />
        </div>
      )}

      {activeTab === 'documents' && (
        <div id="tabpanel-documents" role="tabpanel" aria-labelledby="tab-documents">
          <StudentDocumentsTab studentId={studentId} />
        </div>
      )}

      {activeTab === 'parents' && student && (
        <div id="tabpanel-parents" role="tabpanel" aria-labelledby="tab-parents">
          <FamilyCard
            studentId={studentId}
            studentName={student.name}
            access={access}
            viewer={viewer}
            ownerName={ownerName}
            refreshToken={familyRefresh}
            onShare={canManagePeople(access) ? () => setShareOpen(true) : undefined}
            onLeft={() => router.push('/dashboard/students')}
          />
        </div>
      )}

      {activeTab === 'trends' && (
        <div id="tabpanel-trends" role="tabpanel" aria-labelledby="tab-trends">
          <StudentTrendsTab studentId={studentId} />
        </div>
      )}

      {canManageSources(access) && (
        <ConnectSourceWizard
          open={connectWizardOpen}
          studentId={studentId}
          onClose={() => setConnectWizardOpen(false)}
          onConnected={loadStudent}
        />
      )}

      {canManagePeople(access) && (
        <ShareDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          defaultStudentIds={[studentId]}
          onSent={() => setFamilyRefresh((n) => n + 1)}
        />
      )}
    </div>
  );
}
