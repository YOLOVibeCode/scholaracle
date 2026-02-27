'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ProviderIcon } from '@/components/ui/provider-icon';
import { apiClient } from '@/lib/api/client';
import {
  getAllProviders,
  detectProviderFromUrl,
  type IProviderDescriptor,
} from '@/lib/providers';
import type { IBundleConnection } from './bundle-types';

interface JobStep {
  name: string;
  status: 'pending' | 'in_progress' | 'complete';
  startedAt?: string;
  completedAt?: string;
  details?: Record<string, unknown> | null;
}

interface GenerateStatusResponse {
  success: boolean;
  jobId: string;
  status: string;
  steps?: JobStep[];
  result?: { scraperId: string; scraperCode?: string; transformerCode?: string; metadata?: string };
  error?: string;
  platformName?: string;
  loginUrl?: string;
}

export interface ConnectProviderWizardProps {
  open: boolean;
  onClose: () => void;
  /** When provided, wizard adds to bundle (no download); final step is "Added to bundle". */
  onConnectionReady?: (connection: IBundleConnection) => void;
  /** When provided without onConnectionReady, wizard ends at download step and calls this after download. */
  onAdded?: () => void;
}

type Step = 'platform' | 'credentials' | 'generating' | 'download' | 'added';

/** Synthetic "Other" option for platforms not in the registry. */
const OTHER_PLATFORM: Pick<IProviderDescriptor, 'id' | 'name' | 'description' | 'available' | 'brandColor' | 'urlPlaceholder'> = {
  id: 'other',
  name: 'Other Platform',
  description: 'We\'ll generate a custom scraper for your school portal',
  available: false,
  brandColor: '#6B7280',
  urlPlaceholder: 'https://...',
};

export function ConnectProviderWizard({ open, onClose, onConnectionReady, onAdded }: ConnectProviderWizardProps) {
  const [step, setStep] = useState<Step>('platform');
  const [portalUrl, setPortalUrl] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<IProviderDescriptor | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<IProviderDescriptor | typeof OTHER_PLATFORM | null>(null);
  const [customPlatformName, setCustomPlatformName] = useState('');
  const [studentNameHint, setStudentNameHint] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [scraperId, setScraperId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<GenerateStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<{ scraperId: string | null; platformName: string; loginUrl: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const allProviders = getAllProviders();
  const detectedOS = typeof navigator !== 'undefined' && navigator.userAgent.includes('Win') ? 'windows' : 'mac';

  // Reset wizard state whenever the dialog opens (guards against stale state
  // if a previous session ended via onConnectionReady without handleClose).
  useEffect(() => {
    if (!open) return;
    setStep('platform');
    setPortalUrl('');
    setDetectedProvider(undefined);
    setSelectedProvider(null);
    setCustomPlatformName('');
    setStudentNameHint('');
    setUsername('');
    setPassword('');
    setScraperId(null);
    setJobId(null);
    setJobStatus(null);
    setError(null);
    setGeneratedCode(null);
    setShowCode(false);
    setPendingConnection(null);
  }, [open]);

  useEffect(() => {
    const detected = detectProviderFromUrl(portalUrl);
    setDetectedProvider(detected);
  }, [portalUrl]);

  useEffect(() => {
    if (!jobId || !open) return;
    const poll = async () => {
      try {
        const res = await apiClient.get<GenerateStatusResponse>(
          `/integrations/generate-status?jobId=${encodeURIComponent(jobId)}`
        );
        setJobStatus(res);
        if (res.status === 'ready') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setScraperId(res.result?.scraperId ?? null);
          setGeneratedCode(res.result?.scraperCode ?? null);
          if (onConnectionReady) {
            setPendingConnection({
              scraperId: res.result?.scraperId ?? null,
              platformName: res.platformName ?? '',
              loginUrl: res.loginUrl ?? '',
            });
            setStep('added');
          } else {
            setStep('download');
          }
        } else if (res.status === 'failed') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setError(res.error ?? 'Generation failed');
        }
      } catch {
        // keep polling
      }
    };
    void poll();
    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId, open, onConnectionReady]);

  // When we land on 'added' after generation, build connection from state + pendingConnection and call onConnectionReady once.
  useEffect(() => {
    if (step !== 'added' || !pendingConnection || !onConnectionReady) return;
    const platformId = selectedProvider?.id === 'other' ? 'other' : (selectedProvider as IProviderDescriptor)?.id ?? 'other';
    const connection: IBundleConnection = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `conn-${Date.now()}`,
      platformId,
      platformName: pendingConnection.platformName,
      loginUrl: pendingConnection.loginUrl,
      username,
      password,
      studentNameHint: studentNameHint.trim() || undefined,
      scraperId: pendingConnection.scraperId,
      generationStatus: 'ready',
      jobId: null,
    };
    onConnectionReady(connection);
    setPendingConnection(null);
  }, [step, pendingConnection, onConnectionReady, selectedProvider, username, password, studentNameHint]);

  const handleClose = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setStep('platform');
    setPortalUrl('');
    setDetectedProvider(undefined);
    setSelectedProvider(null);
    setCustomPlatformName('');
    setStudentNameHint('');
    setUsername('');
    setPassword('');
    setScraperId(null);
    setJobId(null);
    setJobStatus(null);
    setError(null);
    setGeneratedCode(null);
    setShowCode(false);
    setPendingConnection(null);
    onClose();
  };

  const handlePlatformSelect = (provider: IProviderDescriptor | typeof OTHER_PLATFORM) => {
    setSelectedProvider(provider);
    if (provider.id !== 'other') {
      const p = provider as IProviderDescriptor;
      if (!portalUrl && p.urlPlaceholder) setPortalUrl(p.urlPlaceholder);
    }
    setStep('credentials');
  };

  const handleCredentialsNext = async () => {
    const provider = selectedProvider;
    if (!provider) return;

    const platformName = provider.id === 'other' ? customPlatformName : provider.name;
    const loginUrl = portalUrl.trim();
    if (!platformName || !loginUrl) {
      setError('Please enter the school portal URL.');
      return;
    }
    const requireStudentName = !onConnectionReady;
    if (requireStudentName && !studentNameHint.trim()) {
      setError('Please fill in student name, username, and password.');
      return;
    }
    if (!username.trim() || !password) {
      setError('Please fill in username and password.');
      return;
    }

    setError(null);

    const isReference = provider.id !== 'other' && (provider as IProviderDescriptor).available;
    if (isReference) {
      setScraperId(null);
      if (onConnectionReady) {
        const platformId = provider.id;
        const connection: IBundleConnection = {
          id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `conn-${Date.now()}`,
          platformId,
          platformName,
          loginUrl,
          username,
          password,
          studentNameHint: studentNameHint.trim() || undefined,
          scraperId: null,
          generationStatus: 'ready',
          jobId: null,
        };
        onConnectionReady(connection);
        setStep('added');
      } else {
        setStep('download');
      }
      return;
    }

    setStep('generating');
    try {
      const res = await apiClient.post<{
        success: boolean;
        scraperId: string | null;
        jobId?: string | null;
        code?: { scraper?: string; transformer?: string; metadata?: string };
        knownPlatform?: boolean;
        fromCache?: boolean;
      }>('/integrations/generate-scraper', {
        platformName,
        loginUrl,
        loginMethod: 'email_password',
        dataTypes: ['grades', 'assignments', 'attendance', 'messages', 'documents', 'teachers'],
      });

      if (res.success) {
        if (res.jobId) {
          setJobId(res.jobId);
          setJobStatus({ success: false, jobId: res.jobId, status: 'queued' });
          setStep('generating');
        } else {
          setScraperId(res.scraperId ?? null);
          setGeneratedCode(res.code?.scraper ?? null);
          setStep('download');
        }
      } else {
        throw new Error('Generation failed');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate scraper');
      setStep('credentials');
    }
  };

  const handleDownload = async () => {
    try {
      const provider = selectedProvider;
      const platformName = provider?.id === 'other' ? customPlatformName : (provider?.name ?? '');
      const loginUrl = portalUrl.trim();

      const baseUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
      const token = apiClient.getToken() ?? (typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null);
      const response = await fetch(`${baseUrl}/integrations/scraper-download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          os: detectedOS,
          ...(scraperId ? { scraperId } : { platform: platformName, url: loginUrl }),
          credentials: { studentName: studentNameHint.trim() || 'default', username: username.trim(), password, studentNameHint: studentNameHint.trim() || undefined },
        }),
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();

      const ext = detectedOS === 'windows' ? '.bat' : '.command';
      const fileName = `scholaracle-${platformName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onAdded?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  const displayName = selectedProvider?.id === 'other' ? customPlatformName : selectedProvider?.name;
  const isReference = selectedProvider && selectedProvider.id !== 'other' && (selectedProvider as IProviderDescriptor).available;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-xl" data-testid="connect-provider-wizard">
        <DialogHeader>
          <DialogTitle>
            {step === 'platform' && 'Connect Your School'}
            {step === 'credentials' && `Set Up ${displayName || 'Your Platform'}`}
            {step === 'generating' && 'Creating Your Scraper'}
            {step === 'download' && 'Ready to Download'}
            {step === 'added' && 'Added to Bundle'}
          </DialogTitle>
          <DialogDescription>
            {step === 'platform' && 'Enter your school portal URL or pick a platform below.'}
            {step === 'credentials' && 'Enter your school portal URL and the credentials you use to check grades.'}
            {step === 'generating' && 'Using AI to create a custom scraper for your school...'}
            {step === 'download' && 'Download and double-click to run. That\'s it.'}
            {step === 'added' && 'This platform is in your bundle. Add more or download when ready.'}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Pick Platform — URL + provider cards */}
        {step === 'platform' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="portal-url">School portal URL</Label>
              <Input
                id="portal-url"
                type="url"
                placeholder="https://yourschool.instructure.com"
                value={portalUrl}
                onChange={(e) => setPortalUrl(e.target.value)}
                data-testid="input-portal-url"
                autoFocus
              />
              {portalUrl && detectedProvider && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Detected: {detectedProvider.name}
                </p>
              )}
            </div>

            <p className="text-sm text-muted-foreground">Or pick your platform:</p>
            <div className="grid grid-cols-2 gap-3">
              {allProviders.map((provider) => (
                <Card
                  key={provider.id}
                  className={`cursor-pointer transition-colors hover:bg-accent ${detectedProvider?.id === provider.id ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => handlePlatformSelect(provider)}
                  data-testid={`platform-${provider.id}`}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <ProviderIcon name={provider.name} brandColor={provider.brandColor} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{provider.name}</p>
                      {provider.available ? (
                        <p className="text-xs text-green-600 dark:text-green-400">Ready to use</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Coming soon</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card
                className="cursor-pointer transition-colors hover:bg-accent"
                onClick={() => handlePlatformSelect(OTHER_PLATFORM)}
                data-testid="platform-other"
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <ProviderIcon name={OTHER_PLATFORM.name} brandColor={OTHER_PLATFORM.brandColor} />
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{OTHER_PLATFORM.name}</p>
                    <p className="text-xs text-muted-foreground">AI-generated</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Step 2: Enter Credentials */}
        {step === 'credentials' && selectedProvider && (
          <div className="space-y-4 pt-2">
            {selectedProvider.id === 'other' && (
              <div className="space-y-2">
                <Label htmlFor="platform-name">Platform name</Label>
                <Input
                  id="platform-name"
                  placeholder="e.g., ParentSquare, Schoology"
                  value={customPlatformName}
                  onChange={(e) => setCustomPlatformName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="login-url">School portal URL</Label>
              <Input
                id="login-url"
                placeholder={selectedProvider.id === 'other' ? 'https://...' : (selectedProvider as IProviderDescriptor).urlPlaceholder}
                value={portalUrl}
                onChange={(e) => setPortalUrl(e.target.value)}
                data-testid="connect-provider-login-url"
              />
              <p className="text-xs text-muted-foreground">
                The URL where you normally log in to see your child&apos;s grades.
              </p>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Your school login</p>
              <p className="text-xs text-muted-foreground">
                Credentials are baked into the downloaded script and never stored on our servers.
              </p>
              <div className="space-y-2">
                <Label htmlFor="student-name-hint">
                  Student name hint {onConnectionReady && '(optional)'}
                </Label>
                <Input
                  id="student-name-hint"
                  placeholder="e.g., Emma (optional for multi-student portals)"
                  value={studentNameHint}
                  onChange={(e) => setStudentNameHint(e.target.value)}
                  data-testid="connect-provider-student-name-hint"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cred-username">Username</Label>
                <Input
                  id="cred-username"
                  placeholder="e.g., parent@email.com"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  data-testid="connect-provider-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cred-password">Password</Label>
                <Input
                  id="cred-password"
                  type="password"
                  placeholder="Your school portal password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="connect-provider-password"
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('platform')}>Back</Button>
              <Button onClick={handleCredentialsNext} data-testid="connect-provider-continue">
                {isReference ? 'Continue' : 'Generate Scraper'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Generating (AI) */}
        {step === 'generating' && (
          <div className="space-y-4 py-4">
            <Card className="border-2">
              <CardContent className="pt-4">
                <p className="font-medium mb-3">
                  {displayName} — {jobStatus?.status ?? 'queued'}
                </p>
                {jobStatus?.error && (
                  <div className="rounded-lg bg-destructive/10 text-destructive p-3 mb-3 text-sm">
                    {jobStatus.error}
                  </div>
                )}
                {jobStatus?.steps?.map((s) => (
                  <div key={s.name} className="flex items-center gap-2 py-1 text-sm">
                    {s.status === 'complete' && <span className="text-green-600">✓</span>}
                    {s.status === 'in_progress' && (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    )}
                    {s.status === 'pending' && <span className="text-muted-foreground">○</span>}
                    <span className={s.status === 'complete' ? 'text-muted-foreground' : ''}>
                      {s.name === 'connect' && (s.status === 'in_progress' ? 'Connecting to site...' : s.status === 'complete' ? 'Connected' : 'Connect')}
                      {s.name === 'crawl' && (s.status === 'in_progress' ? 'Analyzing login page...' : s.status === 'complete' ? 'Login form found' : 'Crawl')}
                      {s.name === 'authenticate_check' && (s.status === 'in_progress' ? 'Checking if login can be automated...' : s.status === 'complete' ? 'Login is automatable' : 'Auth check')}
                      {s.name === 'generate' && (s.status === 'in_progress' ? 'AI is building your scraper...' : s.status === 'complete' ? 'Scraper generated' : 'Generate')}
                      {s.name === 'validate' && (s.status === 'in_progress' ? 'Validating...' : s.status === 'complete' ? 'Validated' : 'Validate')}
                    </span>
                  </div>
                ))}
                {!jobStatus?.steps?.length && (
                  <div className="flex items-center gap-2 py-2">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span className="text-sm text-muted-foreground">Starting...</span>
                  </div>
                )}
              </CardContent>
            </Card>
            {jobStatus?.status === 'failed' && (
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setError(null); setStep('credentials'); }}>Edit details</Button>
                <Button onClick={() => { setError(null); handleCredentialsNext(); }}>Retry</Button>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Download */}
        {step === 'download' && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-4 text-center">
              <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                Your scraper is ready!
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Download it, double-click to run, and your school data will sync to Scholaracle.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button onClick={handleDownload} className="w-full" size="lg" data-testid="button-download-scraper">
              Download for {detectedOS === 'windows' ? 'Windows' : 'Mac'}
            </Button>

            <div className="text-xs text-muted-foreground border-t pt-3 space-y-2">
              <p className="font-medium">What happens when you double-click it:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Installs what it needs (first time only, ~1 minute)</li>
                <li>Opens a browser and logs into your school portal automatically</li>
                <li>You watch it read your child&apos;s grades and assignments</li>
                <li>Shows you a summary and asks you to confirm</li>
                <li>Syncs everything to your Scholaracle dashboard</li>
                <li>Offers to run automatically 3x daily</li>
              </ol>
              <p className="mt-2">
                Your login credentials are stored in the downloaded file and never leave your computer.
              </p>
            </div>

            {generatedCode && (
              <div className="border-t pt-3">
                <Button variant="ghost" size="sm" onClick={() => setShowCode(!showCode)}>
                  {showCode ? 'Hide Code' : 'View Generated Code (Advanced)'}
                </Button>
                {showCode && (
                  <pre className="mt-2 max-h-60 overflow-auto rounded bg-muted p-3 text-xs">
                    {generatedCode}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} data-testid="connect-provider-done">Done</Button>
            </div>
          </div>
        )}

        {/* Step: Added to bundle (when onConnectionReady is used) */}
        {step === 'added' && (
          <div className="space-y-4 pt-2">
            <div className="rounded-lg bg-green-50 dark:bg-green-950/20 p-4 text-center">
              <p className="text-lg font-semibold text-green-700 dark:text-green-400">
                Added to your bundle
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Add more platforms or go back and download the bundle when all are ready.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full" data-testid="connect-provider-done-added">
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
