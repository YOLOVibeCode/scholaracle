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
} from 'lucide-react';
import { studentsApi } from '@/lib/api/students';
import {
  integrationsApi,
  type IIntegration,
  type ICreateIntegrationRequest,
  type IAssignStudentCredentials,
  type ITestConnectionResult,
} from '@/lib/api/integrations';
import { useAsyncData } from '@/lib/hooks';
import {
  getAvailableProviders,
  detectProviderFromUrl,
  findProviderById,
  type IProviderDescriptor,
} from '@/lib/providers';

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
  const [currentIntegration, setCurrentIntegration] = useState<IIntegration | null>(null);

  // Credentials for the current connection
  const [authType, setAuthType] = useState<'api' | 'login'>('api');
  const [accessToken, setAccessToken] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // New provider inline flow
  const [newProviderStep, setNewProviderStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState<IProviderDescriptor | null>(null);
  const [providerDisplayName, setProviderDisplayName] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<IProviderDescriptor | undefined>();
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<ITestConnectionResult | null>(null);

  const availableProviders = getAvailableProviders();

  // Created student tracking
  const [createdStudentId, setCreatedStudentId] = useState<string | null>(null);
  const [createdStudentName, setCreatedStudentName] = useState('');

  // Fetch available integrations (account-level providers the parent already set up)
  const fetchIntegrations = useCallback(() => integrationsApi.list(), []);
  const { data: integrations, retry: refreshIntegrations } = useAsyncData(fetchIntegrations, {
    retryCount: 1,
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const resetCredentials = () => {
    setAuthType('api');
    setAccessToken('');
    setUsername('');
    setPassword('');
    setTestResult(null);
    setTestingConnection(false);
  };

  const handleTestConnection = async () => {
    if (!currentIntegration) return;
    const providerInfo = findProviderById(currentIntegration.provider);
    if (!providerInfo) return;

    setTestingConnection(true);
    setTestResult(null);

    const credPayload: { authType: 'api' | 'login' | 'oauth2' | 'api-key'; accessToken?: string; username?: string; password?: string; clientId?: string; clientSecret?: string } = {
      authType: providerInfo.authMethod === 'bearer-token' ? 'api' : providerInfo.authMethod === 'credentials' ? 'login' : providerInfo.authMethod as 'oauth2' | 'api-key',
    };

    if (accessToken.trim()) credPayload.accessToken = accessToken.trim();
    if (username.trim()) credPayload.username = username.trim();
    if (password) credPayload.password = password;

    const result = await integrationsApi.testConnection({
      provider: currentIntegration.provider,
      adapterId: currentIntegration.adapterId,
      baseUrl: currentIntegration.portalBaseUrl,
      credentials: credPayload,
    });

    setTestResult(result);
    setTestingConnection(false);
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
    setNewProviderStep(1);
    setSelectedProvider(null);
    setProviderDisplayName('');
    setProviderUrl('');
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

    const result = await studentsApi.create({
      name: name.trim(),
      grade: grade || undefined,
      school: school || undefined,
    });

    setSubmitting(false);
    if (result) {
      setCreatedStudentId(result.id);
      setCreatedStudentName(result.name);
      setStep('connect-services');
    } else {
      setError('Failed to create student. Please try again.');
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
    setNewProviderStep(1);
    setSelectedProvider(null);
    setProviderDisplayName('');
    setProviderUrl('');
    setStep('add-provider');
  };

  // ---------------------------------------------------------------------------
  // Step 2b – Add Provider Inline
  // ---------------------------------------------------------------------------

  const handleProviderSelect = (p: IProviderDescriptor) => {
    if (!p.available) return;
    setSelectedProvider(p);
    setNewProviderStep(2);
  };

  const handleProviderCreate = async () => {
    if (!selectedProvider) return;
    setSubmitting(true);
    setError(null);

    const payload: ICreateIntegrationRequest = {
      provider: selectedProvider.id,
      adapterId: selectedProvider.adapterId,
      displayName: providerDisplayName || `${selectedProvider.name}${providerUrl ? ` - ${providerUrl}` : ''}`,
      portalBaseUrl: providerUrl || undefined,
    };

    const result = await integrationsApi.create(payload);
    setSubmitting(false);

    if (result) {
      refreshIntegrations();
      setCurrentIntegration(result);
      resetCredentials();
      setStep('credentials');
    } else {
      setError('Failed to create provider. Please try again.');
    }
  };

  // ---------------------------------------------------------------------------
  // Step 3 – Credentials
  // ---------------------------------------------------------------------------

  const handleConnect = async (skipCredentials: boolean) => {
    if (!currentIntegration || !createdStudentId) return;
    setError(null);
    setSubmitting(true);

    let credentials: IAssignStudentCredentials | undefined;
    if (!skipCredentials) {
      if (authType === 'api' && accessToken.trim()) {
        credentials = { authType: 'api', accessToken: accessToken.trim() };
      } else if (authType === 'login' && username.trim() && password) {
        credentials = { authType: 'login', username: username.trim(), password };
      }
    }

    const result = await integrationsApi.assignStudent(
      currentIntegration.id,
      createdStudentId,
      credentials ? { credentials } : {}
    );
    setSubmitting(false);

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
  };

  const handleSkipCredentials = () => handleConnect(true);

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
    setCurrentIntegration(null);
    resetCredentials();
    setCreatedStudentId(null);
    setCreatedStudentName('');
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
                  Set up a new provider
                </Button>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto text-muted-foreground"
                  onClick={() => setStep('done')}
                  data-testid="wizard-skip-services"
                >
                  {connections.length > 0 ? 'Done connecting' : 'Skip for now'}
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

              {newProviderStep === 1 && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Paste your school portal URL and we&apos;ll detect the platform, or choose from the list.
                  </p>

                  <div className="space-y-2">
                    <Label htmlFor="wizard-detect-url">School portal URL</Label>
                    <Input
                      id="wizard-detect-url"
                      type="url"
                      placeholder="https://yourschool.instructure.com"
                      value={providerUrl}
                      onChange={(e) => {
                        setProviderUrl(e.target.value);
                        setDetectedProvider(detectProviderFromUrl(e.target.value));
                      }}
                      disabled={submitting}
                      data-testid="wizard-provider-url"
                      autoFocus
                    />
                  </div>

                  {providerUrl && detectedProvider && (
                    <button
                      type="button"
                      onClick={() => handleProviderSelect(detectedProvider)}
                      className="flex items-center gap-2 w-full rounded-lg border border-green-200 bg-green-50/50 p-3 text-left hover:bg-green-50 transition-colors dark:border-green-800 dark:bg-green-900/20"
                      data-testid={`wizard-provider-${detectedProvider.id}`}
                    >
                      <Check className="h-4 w-4 text-green-600 shrink-0" />
                      <div>
                        <span className="font-medium text-sm">Detected: {detectedProvider.name}</span>
                        <span className="block text-xs text-muted-foreground">{detectedProvider.description}</span>
                      </div>
                    </button>
                  )}

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or choose</span>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    {availableProviders.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleProviderSelect(p)}
                        className="flex items-start justify-between rounded-lg border p-3 text-left hover:bg-muted/50 transition-colors"
                        data-testid={`wizard-provider-${p.id}`}
                      >
                        <div>
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="block text-xs text-muted-foreground">{p.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              {newProviderStep === 2 && selectedProvider && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Set up <strong>{selectedProvider.name}</strong> for your school.
                  </p>

                  {/* Credential help box */}
                  <div className="rounded-md bg-blue-50/50 border border-blue-200 p-3 dark:bg-blue-900/20 dark:border-blue-800">
                    <p className="font-medium text-sm mb-1.5">{selectedProvider.credentialHelp.title}</p>
                    <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
                      {selectedProvider.credentialHelp.steps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                    {selectedProvider.credentialHelp.docsUrl && (
                      <a
                        href={selectedProvider.credentialHelp.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1.5"
                      >
                        Official documentation &rarr;
                      </a>
                    )}
                  </div>

                  <div className="space-y-3">
                    {!providerUrl && (
                      <div className="space-y-2">
                        <Label htmlFor="wizard-provider-url-2">School portal URL</Label>
                        <Input
                          id="wizard-provider-url-2"
                          type="url"
                          placeholder={selectedProvider.urlPlaceholder}
                          value={providerUrl}
                          onChange={(e) => setProviderUrl(e.target.value)}
                          disabled={submitting}
                          data-testid="wizard-provider-url"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="wizard-provider-name">Display name</Label>
                      <Input
                        id="wizard-provider-name"
                        type="text"
                        placeholder={`${selectedProvider.name} - My School`}
                        value={providerDisplayName}
                        onChange={(e) => setProviderDisplayName(e.target.value)}
                        disabled={submitting}
                        data-testid="wizard-provider-display-name"
                      />
                    </div>
                  </div>

                  {selectedProvider.credentialHelp.note && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                      {selectedProvider.credentialHelp.note}
                    </p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => setNewProviderStep(1)}>
                      Back
                    </Button>
                    <Button
                      type="button"
                      onClick={handleProviderCreate}
                      disabled={submitting}
                      data-testid="wizard-create-provider"
                    >
                      {submitting ? 'Creating...' : 'Create & continue'}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {/* ================================================================
              STEP 3 – Credentials
              ================================================================ */}
          {step === 'credentials' && currentIntegration && (() => {
            const providerInfo = findProviderById(currentIntegration.provider);
            const fields = providerInfo?.credentialHelp.fields ?? ['accessToken'];
            const needsToken = fields.includes('accessToken');
            const needsLogin = fields.includes('username') || fields.includes('password');
            const needsOAuth = fields.length === 0;

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
                    Enter <strong>{createdStudentName}</strong>&apos;s credentials for{' '}
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

                <div className="space-y-3">
                  {/* OAuth-based: no credential fields needed, just a note */}
                  {needsOAuth && (
                    <p className="text-sm text-muted-foreground">
                      This provider uses secure sign-in. No credentials to enter here — click Connect to link the student.
                    </p>
                  )}

                  {/* Token-based (Canvas) */}
                  {needsToken && (
                    <div className="space-y-2">
                      <Label htmlFor="wizard-token">Access token</Label>
                      <Input
                        id="wizard-token"
                        type="password"
                        placeholder="Paste the student's API access token"
                        value={accessToken}
                        onChange={(e) => {
                          setAccessToken(e.target.value);
                          setAuthType('api');
                        }}
                        disabled={submitting}
                        data-testid="wizard-credentials-token"
                      />
                    </div>
                  )}

                  {/* Login-based (Skyward, ParentVUE) */}
                  {needsLogin && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="wizard-username">Username</Label>
                        <Input
                          id="wizard-username"
                          type="text"
                          placeholder="Student's portal username"
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            setAuthType('login');
                          }}
                          disabled={submitting}
                          data-testid="wizard-credentials-username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="wizard-password">Password</Label>
                        <Input
                          id="wizard-password"
                          type="password"
                          placeholder="Student's portal password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setAuthType('login');
                          }}
                          disabled={submitting}
                          data-testid="wizard-credentials-password"
                        />
                      </div>
                    </>
                  )}
                </div>

                {providerInfo?.credentialHelp.note && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                    {providerInfo.credentialHelp.note}
                  </p>
                )}

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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={testingConnection || submitting}
                    data-testid="wizard-test-connection"
                  >
                    {testingConnection ? 'Testing...' : 'Test Connection'}
                  </Button>
                  <div className="flex gap-2 ml-auto">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={handleSkipCredentials}
                      disabled={submitting}
                    >
                      Skip credentials
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleConnect(false)}
                      disabled={submitting}
                      data-testid="wizard-connect-submit"
                    >
                      {submitting ? 'Connecting...' : 'Connect'}
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
