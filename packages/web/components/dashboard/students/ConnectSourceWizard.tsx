'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api/client';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { IAddSourceRequest, ISourceCredentialsRequest } from '@/lib/api/sources';
import { sourceInvitesApi } from '@/lib/api/sourceInvites';
import { isSourceInviteProvider } from '@scholaracle/contracts';

export interface ConnectSourceWizardProps {
  open: boolean;
  studentId: string;
  onClose: () => void;
  onConnected?: () => void;
}

const PROVIDERS = [
  { id: 'canvas', name: 'Canvas LMS', adapterId: 'com.instructure.canvas', available: true },
  { id: 'skyward', name: 'Skyward', adapterId: 'com.skyward', available: true },
  { id: 'aeries', name: 'Aeries', adapterId: 'com.aeries', available: true },
  { id: 'google', name: 'Google Classroom', adapterId: 'com.google.classroom', available: true },
] as const;

export function ConnectSourceWizard({
  open,
  studentId,
  onClose,
  onConnected,
}: ConnectSourceWizardProps) {
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState<typeof PROVIDERS[number] | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [portalBaseUrl, setPortalBaseUrl] = useState('');
  const [credentialMode, setCredentialMode] = useState<'api' | 'skip' | null>(null);
  const [accessToken, setAccessToken] = useState('');
  const [schedule, setSchedule] = useState<IAddSourceRequest['schedule']>('every_6h');
  const [dataTypes, setDataTypes] = useState<string[]>(['grades', 'assignments', 'calendar']);
  const [submitting, setSubmitting] = useState(false);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const handleClose = () => {
    setStep(1);
    setProvider(null);
    setDisplayName('');
    setPortalBaseUrl('');
    setCredentialMode(null);
    setAccessToken('');
    setSchedule('every_6h');
    setDataTypes(['grades', 'assignments', 'calendar']);
    setSubmitting(false);
    setEmailStatus(null);
    onClose();
  };

  const handleStep1Next = (p: typeof PROVIDERS[number]) => {
    if (!p.available) return;
    setProvider(p);
    setStep(2);
  };

  const handleEmailInstallLink = async (): Promise<void> => {
    if (!provider || !isSourceInviteProvider(provider.id)) return;
    if (!portalBaseUrl.trim()) return;
    setSubmitting(true);
    setEmailStatus(null);
    try {
      const result = await sourceInvitesApi.issue({
        studentId,
        provider: provider.id,
        portalBaseUrl: portalBaseUrl.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      });
      setEmailStatus(
        `We emailed ${result.emailedTo}. Open it on your phone or in Chrome — same link.`
      );
    } catch (err: unknown) {
      setEmailStatus(err instanceof Error ? err.message : 'Could not send install link');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStep2Next = () => {
    setStep(3);
  };

  const handleStep3Next = () => {
    setStep(4);
  };

  const handleConnect = async () => {
    if (!provider) return;
    setSubmitting(true);
    const { sourcesApi } = await import('@/lib/api/sources');
    const payload: IAddSourceRequest = {
      provider: provider.id,
      adapterId: provider.adapterId,
      displayName: displayName || `${provider.name} - ${portalBaseUrl || 'Source'}`,
      portalBaseUrl: portalBaseUrl || undefined,
      schedule,
      dataTypes,
    };
    const result = await sourcesApi.addToStudent(studentId, payload);
    if (result && credentialMode === 'api' && accessToken.trim()) {
      const creds: ISourceCredentialsRequest = {
        authType: 'api',
        accessToken: accessToken.trim(),
        baseUrl: portalBaseUrl || undefined,
      };
      await sourcesApi.setCredentials(studentId, result.id, creds);
    }
    setSubmitting(false);
    if (result) {
      onConnected?.();
      handleClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="sm:max-w-md" data-testid="connect-source-wizard">
        <SheetHeader>
          <SheetTitle>Connect a Data Source</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">Choose your LMS provider</p>
              <div className="grid gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleStep1Next(p)}
                    disabled={!p.available}
                    className="flex items-center justify-between rounded-lg border p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    data-testid={`provider-${p.id}`}
                  >
                    <span>{p.name}</span>
                    {!p.available && <span className="text-xs text-gray-500">Coming soon</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && provider && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">Enter connection details</p>
              <div className="space-y-2">
                <Label htmlFor="portal-url">Institution URL</Label>
                <Input
                  id="portal-url"
                  type="url"
                  placeholder="https://yourschool.instructure.com"
                  value={portalBaseUrl}
                  onChange={(e) => setPortalBaseUrl(e.target.value)}
                  data-testid="input-portal-url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  type="text"
                  placeholder={`${provider.name} - My School`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  data-testid="input-display-name"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button type="button" onClick={handleStep2Next} data-testid="button-step2-next">
                  Next
                </Button>
              </div>
              {provider && isSourceInviteProvider(provider.id) && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={submitting || !portalBaseUrl.trim()}
                  onClick={() => void handleEmailInstallLink()}
                  data-testid="button-email-install-link"
                >
                  Email me an install link
                </Button>
              )}
              {emailStatus && <p className="text-sm text-muted-foreground">{emailStatus}</p>}
            </>
          )}

          {step === 3 && provider && (
            <>
              {provider.id === 'google' ? (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Connect your Google account to sync Google Classroom courses and assignments.
                  </p>
                  <Button
                    type="button"
                    disabled={submitting}
                    onClick={async () => {
                      if (!provider) return;
                      setSubmitting(true);
                      const { sourcesApi } = await import('@/lib/api/sources');
                      const payload: IAddSourceRequest = {
                        provider: 'google-classroom',
                        adapterId: 'com.google.classroom',
                        displayName: displayName || provider.name,
                        schedule: 'every_6h',
                        dataTypes: ['grades', 'assignments', 'calendar'],
                      };
                      const result = await sourcesApi.addToStudent(studentId, payload);
                      if (result) {
                        try {
                          const { url } = await apiClient.get<{ url: string }>(
                            `/oauth/google/authorize?studentId=${encodeURIComponent(studentId)}&sourceId=${encodeURIComponent(result.id)}&returnUrl=1`
                          );
                          onConnected?.();
                          handleClose();
                          window.location.href = url;
                          return;
                        } catch {
                          setSubmitting(false);
                        }
                      }
                      setSubmitting(false);
                    }}
                    data-testid="button-google-authorize"
                    className="w-full"
                  >
                    {submitting ? 'Connecting...' : 'Authorize with Google'}
                  </Button>
                </>
              ) : (
                <>
                  {/* Canvas API token (optional) */}
                  {provider.id === 'canvas' && (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Optionally add a Canvas API access token for richer data. You can skip this and sync via the Scholarmancy mobile app instead.
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          variant={credentialMode === 'api' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCredentialMode('api')}
                          data-testid="credential-mode-api"
                        >
                          API / access token
                        </Button>
                        <Button
                          type="button"
                          variant={credentialMode === 'skip' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCredentialMode('skip')}
                          data-testid="credential-mode-skip"
                        >
                          Skip for now
                        </Button>
                      </div>
                      {credentialMode === 'api' && (
                        <div className="space-y-2">
                          <Label htmlFor="access-token">Access token</Label>
                          <Input
                            id="access-token"
                            type="password"
                            placeholder="Paste your Canvas API token"
                            value={accessToken}
                            onChange={(e) => setAccessToken(e.target.value)}
                            data-testid="input-access-token"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  {/* Skyward / Aeries: portal login is on-device only */}
                  {(provider.id === 'skyward' || provider.id === 'aeries') && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800 p-4 space-y-2">
                      <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">
                        Portal login happens in the Scholarmancy mobile app
                      </p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        For {provider.name}, syncing requires you to log in to the portal on your device. Download the Scholarmancy app and add this source there so your credentials stay on your device.
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        You can still register the source here — just connect it in the app to start syncing.
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-4">
                    <Button type="button" variant="outline" onClick={() => setStep(2)}>
                      Back
                    </Button>
                    <Button type="button" onClick={handleStep3Next} data-testid="button-step3-next">
                      Next
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 4 && provider && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">Configure sync</p>
              <div className="space-y-2">
                <Label>Schedule</Label>
                <div className="flex gap-2 flex-wrap">
                  {(['hourly', 'every_6h', 'daily', 'manual'] as const).map((s) => (
                    <label key={s} className="flex items-center gap-1">
                      <input
                        type="radio"
                        name="schedule"
                        value={s}
                        checked={schedule === s}
                        onChange={() => setSchedule(s)}
                      />
                      {s.replace('_', ' ')}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Data to sync</Label>
                <div className="flex gap-2 flex-wrap">
                  {['grades', 'assignments', 'calendar', 'attendance'].map((t) => (
                    <label key={t} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={dataTypes.includes(t)}
                        onChange={(e) =>
                          setDataTypes((prev) =>
                            e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)
                          )
                        }
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setStep(3)}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleConnect}
                  disabled={submitting || dataTypes.length === 0}
                  data-testid="button-connect-submit"
                >
                  {submitting ? 'Connecting...' : 'Connect & Start Sync'}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
