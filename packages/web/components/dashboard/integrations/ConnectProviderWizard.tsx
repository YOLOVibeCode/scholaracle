'use client';

import { useState, useEffect, type JSX } from 'react';
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
import {
  getAllProviders,
  detectProviderFromUrl,
  type IProviderDescriptor,
} from '@/lib/providers';
import type { IBundleConnection } from './bundle-types';
import { sourceInvitesApi } from '@/lib/api/sourceInvites';
import { isSourceInviteProvider } from '@scholaracle/contracts';
import { ConnectOnPhonePanel } from './ConnectOnPhonePanel';

export interface ConnectProviderWizardProps {
  open: boolean;
  onClose: () => void;
  /** When provided, wizard adds to bundle (no download); parent receives connection then user finishes on phone. */
  onConnectionReady?: (connection: IBundleConnection) => void;
  /** Called after the user finishes the connect-on-phone step (optional). */
  onAdded?: () => void;
  /** When set, show Email me an install link for builtin portals. */
  studentId?: string;
}

type Step = 'platform' | 'credentials' | 'connect-phone';

/** Synthetic "Other" option for platforms not in the registry. */
const OTHER_PLATFORM: Pick<
  IProviderDescriptor,
  'id' | 'name' | 'description' | 'available' | 'brandColor' | 'urlPlaceholder'
> = {
  id: 'other',
  name: 'Other Platform',
  description: 'School portal not listed — connect from your phone',
  available: false,
  brandColor: '#6B7280',
  urlPlaceholder: 'https://...',
};

function newConnectionId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `conn-${Date.now()}`;
}

export function ConnectProviderWizard({
  open,
  onClose,
  onConnectionReady,
  onAdded,
  studentId,
}: ConnectProviderWizardProps): JSX.Element {
  const [step, setStep] = useState<Step>('platform');
  const [portalUrl, setPortalUrl] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<IProviderDescriptor | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<IProviderDescriptor | typeof OTHER_PLATFORM | null>(
    null
  );
  const [customPlatformName, setCustomPlatformName] = useState('');
  const [studentNameHint, setStudentNameHint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<string | null>(null);

  const allProviders = getAllProviders();

  useEffect(() => {
    if (!open) return;
    setStep('platform');
    setPortalUrl('');
    setDetectedProvider(undefined);
    setSelectedProvider(null);
    setCustomPlatformName('');
    setStudentNameHint('');
    setError(null);
    setEmailStatus(null);
  }, [open]);

  useEffect(() => {
    const detected = detectProviderFromUrl(portalUrl);
    setDetectedProvider(detected);
  }, [portalUrl]);

  const handleClose = () => {
    setStep('platform');
    setPortalUrl('');
    setDetectedProvider(undefined);
    setSelectedProvider(null);
    setCustomPlatformName('');
    setStudentNameHint('');
    setError(null);
    setEmailStatus(null);
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

  const handleCredentialsNext = () => {
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
      setError('Please fill in student name.');
      return;
    }

    setError(null);

    const platformId =
      provider.id === 'other' ? 'other' : (provider as IProviderDescriptor).id ?? 'other';

    if (onConnectionReady) {
      const connection: IBundleConnection = {
        id: newConnectionId(),
        platformId,
        platformName,
        loginUrl,
        studentNameHint: studentNameHint.trim() || undefined,
        scraperId: null,
        generationStatus: 'ready',
        jobId: null,
      };
      onConnectionReady(connection);
    }

    setStep('connect-phone');
  };

  const handleEmailInstallLink = async (): Promise<void> => {
    if (!studentId || !selectedProvider || !isSourceInviteProvider(selectedProvider.id)) return;
    if (!portalUrl.trim()) {
      setError('Please enter the school portal URL.');
      return;
    }
    setError(null);
    setEmailStatus(null);
    try {
      const result = await sourceInvitesApi.issue({
        studentId,
        provider: selectedProvider.id,
        portalBaseUrl: portalUrl.trim(),
      });
      setEmailStatus(`We emailed ${result.emailedTo}. Open it on your phone or in Chrome — same link.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send install link');
    }
  };

  const handleConnectPhoneDone = () => {
    onAdded?.();
    handleClose();
  };

  const displayName = selectedProvider?.id === 'other' ? customPlatformName : selectedProvider?.name;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-xl" data-testid="connect-provider-wizard">
        <DialogHeader>
          <DialogTitle>
            {step === 'platform' && 'Connect Your School'}
            {step === 'credentials' && `Set Up ${displayName || 'Your Platform'}`}
            {step === 'connect-phone' && 'Connect from your phone'}
          </DialogTitle>
          <DialogDescription>
            {step === 'platform' && 'Enter your school portal URL or pick a platform below.'}
            {step === 'credentials' &&
              'Enter your school portal URL. You will finish connecting in the Scholarmancy app on your phone.'}
            {step === 'connect-phone' &&
              'Scan the QR code or copy the link and open it on your phone to continue in the app.'}
          </DialogDescription>
        </DialogHeader>

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
                <p className="text-xs text-green-600 dark:text-green-400">Detected: {detectedProvider.name}</p>
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
                    <p className="text-xs text-muted-foreground">Not listed</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

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
                placeholder={
                  selectedProvider.id === 'other' ? 'https://...' : (selectedProvider as IProviderDescriptor).urlPlaceholder
                }
                value={portalUrl}
                onChange={(e) => setPortalUrl(e.target.value)}
                data-testid="connect-provider-login-url"
              />
              <p className="text-xs text-muted-foreground">
                The URL where you normally log in to see your child&apos;s grades.
              </p>
            </div>

            <div className="border-t pt-4 space-y-3">
              <p className="text-sm font-medium">Student name hint (optional)</p>
              <p className="text-xs text-muted-foreground">
                School portal credentials stay on your device and are entered in the app — never uploaded to
                Scholarmancy.
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
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            {emailStatus && <p className="text-sm text-muted-foreground">{emailStatus}</p>}

            <div className="flex gap-2 pt-2 flex-wrap">
              <Button variant="outline" onClick={() => setStep('platform')}>
                Back
              </Button>
              {studentId && selectedProvider && isSourceInviteProvider(selectedProvider.id) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleEmailInstallLink()}
                  data-testid="button-email-install-link"
                >
                  Email me an install link
                </Button>
              )}
              <Button onClick={handleCredentialsNext} data-testid="connect-provider-continue">
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 'connect-phone' && (
          <div className="space-y-4 pt-2">
            <ConnectOnPhonePanel studentId={studentId} />
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep('credentials')}>
                Back
              </Button>
              <Button onClick={handleConnectPhoneDone} className="w-full sm:w-auto" data-testid="connect-provider-done">
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
