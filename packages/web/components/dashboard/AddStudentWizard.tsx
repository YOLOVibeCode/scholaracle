'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Check,
  Plus,
  ChevronRight,
  Plug,
  GraduationCap,
  ArrowLeft,
  Trash2,
} from 'lucide-react';
import { studentsApi } from '@/lib/api/students';
import {
  integrationsApi,
  type IIntegration,
  type IAssignStudentCredentials,
  type ITestConnectionResult,
} from '@/lib/api/integrations';
import { apiClient } from '@/lib/api/client';
import { useAsyncData } from '@/lib/hooks';
import { findProviderById } from '@/lib/providers';
import { ConnectProviderWizard } from '@/components/dashboard/integrations/ConnectProviderWizard';
import type { IBundleConnection, IBundleConnectionPayload } from '@/components/dashboard/integrations/bundle-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WizardStep = 'student-info' | 'connect-services' | 'add-provider' | 'credentials' | 'done';

interface ServiceConnection {
  integrationId: string;
  integrationName: string;
  hasCredentials: boolean;
}

export interface AddStudentWizardProps {
  open: boolean;
  onClose: () => void;
  /** Called after a student is created (or after the wizard finishes) so the parent can refresh. */
  onStudentAdded?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddStudentWizard({ open, onClose, onStudentAdded }: AddStudentWizardProps) {
  // Student info
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [school, setSchool] = useState('');

  // Wizard state
  const [step, setStep] = useState<WizardStep>('student-info');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Service connections accumulated during this wizard session
  const [connections, setConnections] = useState<ServiceConnection[]>([]);
  // Bundle: platform connections to be downloaded as one script (connection-centric flow)
  const [bundle, setBundle] = useState<IBundleConnection[]>([]);
  const [currentIntegration, setCurrentIntegration] = useState<IIntegration | null>(null);

  // New provider: open ConnectProviderWizard; after download or add-to-bundle we update state
  const [connectProviderWizardOpen, setConnectProviderWizardOpen] = useState(false);
  const [bundleDownloading, setBundleDownloading] = useState(false);
  const [testResult, setTestResult] = useState<ITestConnectionResult | null>(null);

  // Created student tracking
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);
  const [createdStudentName, setCreatedStudentName] = useState('');

  // Fetch available integrations (account-level providers the parent already set up)
  const fetchIntegrations = useCallback(() => integrationsApi.list(), []);
  const { data: integrations } = useAsyncData(fetchIntegrations, {
    retryCount: 1,
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const resetCredentials = () => {
    setTestResult(null);
  };

  const resetAll = () => {
    setName('');
    setGrade('');
    setSchool('');
    setStep('student-info');
    setError(null);
    setSubmitting(false);
    setConnections([]);
    setCurrentIntegration(null);
    resetCredentials();
    setConnectProviderWizardOpen(false);
    setCreatedStudentId(null);
    setCreatedStudentName('');
  };
  const handleClose = () => {
    resetAll();
    onClose();
  };

  // ---------------------------------------------------------------------------
  // Step 1 – Student Info
  // ---------------------------------------------------------------------------

  const handleStudentInfoNext = async () => {
    if (!name.trim()) {
      setError('Student name is required');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const result = await studentsApi.create({
        name: name.trim(),
        grade: grade || undefined,
        school: school || undefined,
      });

      if (result) {
        setCreatedStudentId(result.id);
        setCreatedStudentName(result.name);
        setStep('connect-services');
      } else {
        setError('Failed to create student. Please try again.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create student. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 2 – Connect Services
  // ---------------------------------------------------------------------------

  const handleSelectIntegration = (integration: IIntegration) => {
    setCurrentIntegration(integration);
    resetCredentials();
    setStep('credentials');
  };

  const handleAddNewProvider = () => {
    setStep('add-provider');
  };

  // ---------------------------------------------------------------------------
  // Step 3 – Credentials
  // ---------------------------------------------------------------------------

  const handleConnect = async (skipCredentials: boolean) => {
    if (!currentIntegration || !createdStudentId) return;
    setError(null);
    setSubmitting(true);

    const credentials: IAssignStudentCredentials | undefined = undefined;

    if (skipCredentials) {
      // Link without credentials; user can add them later from the app or extension.
    }

    try {
      const result = await integrationsApi.assignStudent(
        currentIntegration.id,
        createdStudentId,
        credentials ? { credentials } : {}
      );

      if (result) {
        setConnections((prev) => [
          ...prev,
          {
            integrationId: currentIntegration.id,
            integrationName: currentIntegration.displayName,
            hasCredentials: Boolean(credentials),
          },
        ]);
        setCurrentIntegration(null);
        resetCredentials();
        setStep('done');
      } else {
        setError('Failed to connect student to service.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect student to service.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 4 – Done
  // ---------------------------------------------------------------------------
  const handleFinish = () => {
    onStudentAdded?.();
    handleClose();
  };

  const handleAddAnotherService = () => {
    setError(null);
    setStep('connect-services');
  };

  const handleAddAnotherStudent = () => {
    onStudentAdded?.(); // refresh parent before starting new student
    setName('');
    setGrade('');
    setSchool('');
    setStep('student-info');
    setError(null);
    setConnections([]);
    setBundle([]);
    setCurrentIntegration(null);
    resetCredentials();
    setCreatedStudentId(null);
    setCreatedStudentName('');
  };
  const handleRemoveFromBundle = (id: string) => {
    setBundle((b) => b.filter((c) => c.id !== id));
  };

  const handleDownloadBundle = async () => {
    if (bundle.length === 0) return;
    const allReady = bundle.every((c) => c.generationStatus === 'ready');
    if (!allReady) return;

    const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
    const token = apiClient.getToken() ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
    const detectedOS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Win') ? 'windows' : 'mac';
    const payload: IBundleConnectionPayload[] = bundle.map((c) => ({
      platformId: c.platformId,
      platformName: c.platformName,
      loginUrl: c.loginUrl,
      scraperId: c.scraperId,
      credentials: {
        studentNameHint: c.studentNameHint,
      },
    }));

    setBundleDownloading(true);
    setError(null);
    try {
      const response = await fetch(`${baseUrl}/integrations/scraper-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ os: detectedOS, connections: payload }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Download failed');
      }
      const blob = await response.blob();
      const ext = detectedOS === 'windows' ? '.bat' : '.command';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scholaracle-bundle${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setConnections((c) => [
        ...c,
        { integrationId: 'bundle', integrationName: 'Downloaded bundle', hasCredentials: true },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setBundleDownloading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  const connectedIds = connections.map((c) => c.integrationId);
  const availableIntegrations = (integrations ?? []).filter(
    (i) => !connectedIds.includes(i.id)
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto" data-testid="add-student-wizard">
        <SheetHeader>
          <SheetTitle>
            {step === 'student-info' && 'Add Student'}
            {step === 'connect-services' && 'Connect Services'}
            {step === 'add-provider' && 'Set Up Provider'}
            {step === 'credentials' && 'Student Credentials'}
            {step === 'done' && 'All Set!'}
          </SheetTitle>
        </SheetHeader>

        <div className="py-4 space-y-4">
          {/* ── Progress indicator ── */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={
                step === 'student-info'
                  ? 'font-semibold text-foreground'
                  : 'text-green-600'
              }
            >
              1. Student
            </span>
            <ChevronRight className="h-3 w-3" />
            <span
              className={
                ['connect-services', 'add-provider', 'credentials'].includes(step)
                  ? 'font-semibold text-foreground'
                  : step === 'done'
                    ? 'text-green-600'
                    : ''
              }
            >
              2. Services
            </span>
            <ChevronRight className="h-3 w-3" />
            <span className={step === 'done' ? 'font-semibold text-foreground' : ''}>
              3. Done
            </span>
          </div>

          {/* ── Error banner ── */}
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          {/* ================================================================
              STEP 1 – Student Info
              ================================================================ */}
          {step === 'student-info' && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <GraduationCap className="h-4 w-4" />
                <span>Enter your student&apos;s information</span>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="wizard-name">Name *</Label>
                  <Input
                    id="wizard-name"
                    type="text"
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={submitting}
                    data-testid="wizard-student-name"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wizard-grade">Grade</Label>
                  <Input
                    id="wizard-grade"
                    type="number"
                    placeholder="e.g. 10"
                    min={1}
                    max={12}
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    disabled={submitting}
                    data-testid="wizard-student-grade"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="wizard-school">School</Label>
                  <Input
                    id="wizard-school"
                    type="text"
                    placeholder="e.g. Lincoln High School"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    disabled={submitting}
                    data-testid="wizard-student-school"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleStudentInfoNext}
                  disabled={submitting || !name.trim()}
                  data-testid="wizard-next-step"
                >
                  {submitting ? 'Creating...' : 'Next \u2014 Connect services'}
                </Button>
              </div>
            </>
          )}

          {/* ================================================================
              STEP 2 – Connect Services
              ================================================================ */}
          {step === 'connect-services' && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Plug className="h-4 w-4" />
                <span>
                  Connect <strong>{createdStudentName}</strong> to a grade portal
                </span>
              </div>

              {/* Bundle: platforms to download as one script */}
              {bundle.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Platforms in bundle:</p>
                  {bundle.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{c.platformName}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.loginUrl}</span>
                      </div>
                      <Badge
                        variant={c.generationStatus === 'ready' ? 'default' : c.generationStatus === 'failed' ? 'destructive' : 'secondary'}
                        className="text-[10px] shrink-0"
                      >
                        {c.generationStatus === 'ready' ? 'Ready' : c.generationStatus === 'failed' ? 'Failed' : 'Generating'}
                      </Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => handleRemoveFromBundle(c.id)}
                        aria-label="Remove from bundle"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Already-connected list */}
              {connections.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Connected:</p>
                  {connections.map((c) => (
                    <div key={c.integrationId} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-green-600" />
                      <span>{c.integrationName}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {c.hasCredentials ? 'with credentials' : 'no credentials'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}

              {/* Existing integrations the parent already set up */}
              {availableIntegrations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Your integrations</p>
                  <p className="text-xs text-muted-foreground">
                    Select a provider you&apos;ve already set up to reuse it for this student.
                  </p>
                  <div className="grid gap-2">
                    {availableIntegrations.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => handleSelectIntegration(i)}
                        className="flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                        data-testid={`wizard-integration-${i.id}`}
                      >
                        <div>
                          <span className="font-medium text-sm">{i.displayName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {i.provider} &middot;{' '}
                            {i.linkedStudents ?? 0} student
                            {(i.linkedStudents ?? 0) !== 1 ? 's' : ''} linked
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Divider + "Set up new provider" */}
              <div className="space-y-2">
                {availableIntegrations.length > 0 && (
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleAddNewProvider}
                  data-testid="wizard-add-new-provider"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add another platform
                </Button>
              </div>

              {bundle.length > 0 && (
                <Button
                  type="button"
                  className="w-full"
                  disabled={
                    bundleDownloading ||
                    !bundle.every((c) => c.generationStatus === 'ready')
                  }
                  onClick={handleDownloadBundle}
                  data-testid="wizard-download-bundle"
                >
                  {bundleDownloading ? 'Downloading...' : 'Download Bundle'}
                </Button>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-muted-foreground"
                  onClick={() => setStep('done')}
                  data-testid="wizard-skip-services"
                >
                  {connections.length > 0 || bundle.length > 0 ? 'Done connecting' : 'Skip for now'}
                </Button>
              </div>
            </>
          )}

          {/* ================================================================
              STEP 2b – Add Provider Inline
              ================================================================ */}
          {step === 'add-provider' && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground -ml-2"
                onClick={() => setStep('connect-services')}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to services
              </Button>

              <p className="text-sm text-muted-foreground">
                Connect a new school platform. Use the iOS app, browser extension, or the local CLI to run the scraper on your computer — your school login stays on your device.
              </p>

              <Button
                type="button"
                onClick={() => setConnectProviderWizardOpen(true)}
                data-testid="wizard-open-connect-provider"
              >
                Open setup wizard
              </Button>

              <ConnectProviderWizard
                open={connectProviderWizardOpen}
                studentId={createdStudentId ?? undefined}
                onClose={() => setConnectProviderWizardOpen(false)}
                onConnectionReady={(connection) => {
                  setBundle((b) => [...b, connection]);
                  setConnectProviderWizardOpen(false);
                  setStep('connect-services');
                }}
              />
            </>
          )}

          {/* ================================================================
              STEP 3 – Credentials
              ================================================================ */}
          {step === 'credentials' && currentIntegration && (() => {
            const providerInfo = findProviderById(currentIntegration.provider);

            return (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground -ml-2"
                  onClick={() => {
                    setCurrentIntegration(null);
                    resetCredentials();
                    setStep('connect-services');
                  }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to services
                </Button>

                <div className="text-sm">
                  <p>
                    Connecting <strong>{createdStudentName}</strong> to{' '}
                    <strong>{currentIntegration.displayName}</strong>.
                  </p>
                </div>

                {/* Provider-specific help box */}
                {providerInfo && (
                  <div className="rounded-md bg-blue-50/50 border border-blue-200 p-3 dark:bg-blue-900/20 dark:border-blue-800">
                    <p className="font-medium text-sm mb-1.5">{providerInfo.credentialHelp.title}</p>
                    <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                      {providerInfo.credentialHelp.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    {providerInfo.credentialHelp.docsUrl && (
                      <a
                        href={providerInfo.credentialHelp.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1.5"
                      >
                        Official documentation &rarr;
                      </a>
                    )}
                  </div>
                )}

                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-4 space-y-2">
                  <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                    School portal credentials stay on your device
                  </p>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {currentIntegration.displayName} uses browser-based extraction. Your student&apos;s
                    school login is never uploaded to Scholarmancy.
                  </p>
                  <ul className="text-sm text-amber-800 dark:text-amber-200 list-disc list-inside space-y-1">
                    <li>
                      <strong>iOS app</strong> — tap Add Source inside the Scholarmancy app
                    </li>
                    <li>
                      <strong>Browser extension</strong> — connect from the school&apos;s portal page
                    </li>
                    <li>
                      <strong>Local CLI</strong> — run{' '}
                      <code className="bg-amber-100 dark:bg-amber-900 rounded px-1">
                        npx scholaracle-scraper run
                      </code>
                    </li>
                  </ul>
                </div>

                {/* Test Connection result */}
                {testResult && (
                  <div
                    className={`flex items-start gap-2 rounded-md p-3 text-sm ${
                      testResult.success
                        ? 'border border-green-200 bg-green-50/50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200'
                        : 'border border-red-200 bg-red-50/50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
                    }`}
                    data-testid="test-connection-result"
                  >
                    {testResult.success ? (
                      <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    ) : (
                      <span className="text-red-600 shrink-0 mt-0.5">✗</span>
                    )}
                    <div>
                      <p className="font-medium">{testResult.success ? 'Connection successful!' : 'Connection failed'}</p>
                      <p className="text-xs mt-0.5 opacity-80">{testResult.message}</p>
                      {testResult.durationMs > 0 && (
                        <p className="text-[10px] mt-0.5 opacity-60">{testResult.durationMs}ms</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-2 flex-wrap">
                  <div className="flex gap-2 ml-auto">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleConnect(true)}
                      disabled={submitting}
                      data-testid="wizard-connect-submit"
                    >
                      {submitting ? 'Connecting...' : 'Continue without credentials'}
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}

          {/* ================================================================
              STEP 4 – Done
              ================================================================ */}
          {step === 'done' && (
            <>
              <Card className="border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20">
                <CardContent className="pt-5 pb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Check className="h-5 w-5 text-green-600" />
                    <span className="font-semibold">{createdStudentName} added!</span>
                  </div>
                  {connections.length > 0 ? (
                    <div className="text-sm text-muted-foreground space-y-1">
                      <p>Connected to:</p>
                      {connections.map((c) => (
                        <div key={c.integrationId} className="flex items-center gap-1.5 text-sm">
                          <Plug className="h-3 w-3" />
                          <span>{c.integrationName}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {c.hasCredentials ? 'credentials saved' : 'no credentials yet'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No services connected yet. You can add them later from the student page.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleAddAnotherService}
                  data-testid="wizard-add-another-service"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Connect another service
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleAddAnotherStudent}
                  data-testid="wizard-add-another-student"
                >
                  <GraduationCap className="mr-2 h-4 w-4" />
                  Add another student
                </Button>
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleFinish}
                  data-testid="wizard-finish"
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
