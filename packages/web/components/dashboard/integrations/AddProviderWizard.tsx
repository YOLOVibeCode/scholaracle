'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Check, Globe, ArrowLeft, ExternalLink, Search } from 'lucide-react';
import {
  integrationsApi,
  type ICreateIntegrationRequest,
} from '@/lib/api/integrations';
import {
  getAllProviders,
  detectProviderFromUrl,
  type IProviderDescriptor,
} from '@/lib/providers';

export interface AddProviderWizardProps {
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
}

type WizardStep = 'url' | 'pick' | 'confirm' | 'settings';

export function AddProviderWizard({ open, onClose, onAdded }: AddProviderWizardProps) {
  const [step, setStep] = useState<WizardStep>('url');
  const [portalUrl, setPortalUrl] = useState('');
  const [detectedProvider, setDetectedProvider] = useState<IProviderDescriptor | undefined>();
  const [selectedProvider, setSelectedProvider] = useState<IProviderDescriptor | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [schedule, setSchedule] = useState<ICreateIntegrationRequest['schedule']>('every_6h');
  const [dataTypes, setDataTypes] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allProviders = getAllProviders();

  // Auto-detect as the user types
  useEffect(() => {
    const detected = detectProviderFromUrl(portalUrl);
    setDetectedProvider(detected);
  }, [portalUrl]);

  const handleClose = () => {
    setStep('url');
    setPortalUrl('');
    setDetectedProvider(undefined);
    setSelectedProvider(null);
    setDisplayName('');
    setSchedule('every_6h');
    setDataTypes([]);
    setError(null);
    onClose();
  };

  // Step 1: URL entered → auto-detect or manual pick
  const handleUrlNext = () => {
    if (detectedProvider) {
      setSelectedProvider(detectedProvider);
      setDataTypes([...detectedProvider.dataTypes]);
      setStep('confirm');
    } else {
      setStep('pick');
    }
  };

  // Step 2 (manual): User picks a provider
  const handlePickProvider = (p: IProviderDescriptor) => {
    setSelectedProvider(p);
    setDataTypes([...p.dataTypes]);
    setStep('confirm');
  };

  // Step 3: Confirmed provider → go to settings
  const handleConfirmNext = () => {
    setStep('settings');
  };

  // Step 4: Create the integration
  const handleCreate = async () => {
    if (!selectedProvider) return;
    setSubmitting(true);
    setError(null);

    const payload: ICreateIntegrationRequest = {
      provider: selectedProvider.id,
      adapterId: selectedProvider.adapterId,
      displayName: displayName || `${selectedProvider.name}${portalUrl ? ` - ${new URL(portalUrl).hostname}` : ''}`,
      portalBaseUrl: portalUrl || undefined,
      schedule,
      dataTypes,
      enabled: true,
    };

    const result = await integrationsApi.create(payload);
    setSubmitting(false);
    if (result) {
      onAdded?.();
      handleClose();
    } else {
      setError('Failed to create provider. Please try again.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="sm:max-w-md overflow-y-auto" data-testid="add-provider-wizard">
        <SheetHeader>
          <SheetTitle>Add Provider</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}

          {/* ================================================================
              STEP 1: Enter school URL
              ================================================================ */}
          {step === 'url' && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="h-4 w-4" />
                <span>Paste your school&apos;s portal URL and we&apos;ll detect the platform</span>
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-url">School portal URL</Label>
                <Input
                  id="provider-url"
                  type="url"
                  placeholder="https://yourschool.instructure.com"
                  value={portalUrl}
                  onChange={(e) => setPortalUrl(e.target.value)}
                  data-testid="input-portal-url"
                  autoFocus
                />
              </div>

              {/* Auto-detection result */}
              {portalUrl && detectedProvider && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-800 dark:bg-green-900/20">
                  <Check className="h-4 w-4 text-green-600 shrink-0" />
                  <div className="text-sm">
                    <span className="font-medium">Detected: {detectedProvider.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {detectedProvider.description}
                    </span>
                  </div>
                </div>
              )}

              {portalUrl && !detectedProvider && portalUrl.includes('.') && (
                <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                  <Search className="inline h-3.5 w-3.5 mr-1" />
                  We couldn&apos;t auto-detect the platform. You can pick it manually on the next step.
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleUrlNext}
                  data-testid="button-url-next"
                >
                  {detectedProvider ? `Continue with ${detectedProvider.name}` : 'Pick manually'}
                </Button>
              </div>

              <button
                type="button"
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setStep('pick')}
              >
                I don&apos;t have a URL — let me pick from the list
              </button>
            </>
          )}

          {/* ================================================================
              STEP 2: Manual provider selection
              ================================================================ */}
          {step === 'pick' && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground -ml-2"
                onClick={() => setStep('url')}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>

              <p className="text-sm text-muted-foreground">
                Choose your school&apos;s learning management system or student portal
              </p>

              <div className="grid gap-2">
                {allProviders.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => p.available && handlePickProvider(p)}
                    disabled={!p.available}
                    className="flex items-start justify-between rounded-lg border p-3 text-left hover:bg-muted/50 disabled:opacity-50 transition-colors"
                    data-testid={`add-provider-${p.id}`}
                  >
                    <div>
                      <span className="font-medium text-sm">{p.name}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {p.description}
                      </span>
                    </div>
                    {!p.available && (
                      <Badge variant="secondary" className="text-[10px] shrink-0 ml-2">
                        Coming soon
                      </Badge>
                    )}
                  </button>
                ))}
              </div>

              <p className="text-xs text-muted-foreground">
                Don&apos;t see your school&apos;s system? We&apos;re adding more — contact us at support@scholaracle.com
              </p>
            </>
          )}

          {/* ================================================================
              STEP 3: Confirm detected/selected provider
              ================================================================ */}
          {step === 'confirm' && selectedProvider && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground -ml-2"
                onClick={() => {
                  setSelectedProvider(null);
                  setStep(portalUrl ? 'url' : 'pick');
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>

              <div className="rounded-lg border p-4 space-y-3">
                <div>
                  <p className="font-medium">{selectedProvider.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedProvider.description}</p>
                </div>

                {/* Capabilities */}
                <div className="flex flex-wrap gap-1.5">
                  {selectedProvider.dataTypes.map((dt) => (
                    <Badge key={dt} variant="secondary" className="text-[10px]">
                      {dt}
                    </Badge>
                  ))}
                </div>

                {/* How to get credentials */}
                <div className="rounded-md bg-blue-50/50 border border-blue-200 p-3 dark:bg-blue-900/20 dark:border-blue-800">
                  <p className="font-medium text-sm mb-2">
                    {selectedProvider.credentialHelp.title}
                  </p>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    {selectedProvider.credentialHelp.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  {selectedProvider.credentialHelp.docsUrl && (
                    <a
                      href={selectedProvider.credentialHelp.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-2"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Official documentation
                    </a>
                  )}
                </div>
              </div>

              {/* URL if not already entered */}
              {!portalUrl && (
                <div className="space-y-2">
                  <Label htmlFor="confirm-url">School portal URL (optional)</Label>
                  <Input
                    id="confirm-url"
                    type="url"
                    placeholder={selectedProvider.urlPlaceholder}
                    value={portalUrl}
                    onChange={(e) => setPortalUrl(e.target.value)}
                    data-testid="input-portal-url"
                  />
                </div>
              )}

              {/* Display name */}
              <div className="space-y-2">
                <Label htmlFor="confirm-name">Display name</Label>
                <Input
                  id="confirm-name"
                  type="text"
                  placeholder={`${selectedProvider.name} - My School`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  data-testid="input-display-name"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  onClick={handleConfirmNext}
                  data-testid="button-step2-next"
                >
                  Next
                </Button>
              </div>
            </>
          )}

          {/* ================================================================
              STEP 4: Schedule & data type settings
              ================================================================ */}
          {step === 'settings' && selectedProvider && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-muted-foreground -ml-2"
                onClick={() => setStep('confirm')}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </Button>

              <p className="text-sm text-muted-foreground">
                Set how often to sync and what data to pull from{' '}
                <strong>{selectedProvider.name}</strong>.
              </p>

              <div className="space-y-2">
                <Label>Sync schedule</Label>
                <div className="flex gap-2 flex-wrap">
                  {(['hourly', 'every_6h', 'daily', 'manual'] as const).map((s) => (
                    <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="schedule"
                        value={s}
                        checked={schedule === s}
                        onChange={() => setSchedule(s)}
                        className="accent-primary"
                      />
                      {s === 'every_6h' ? 'Every 6 hours' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Data to sync</Label>
                <div className="flex gap-2 flex-wrap">
                  {['grades', 'assignments', 'calendar', 'attendance'].map((t) => {
                    const supported = selectedProvider.dataTypes.includes(t);
                    return (
                      <label
                        key={t}
                        className={`flex items-center gap-1.5 text-sm ${supported ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                      >
                        <input
                          type="checkbox"
                          checked={dataTypes.includes(t)}
                          disabled={!supported}
                          onChange={(e) =>
                            setDataTypes((prev) =>
                              e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)
                            )
                          }
                          className="accent-primary"
                        />
                        {t}
                        {!supported && (
                          <span className="text-[10px] text-muted-foreground">(n/a)</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {selectedProvider.credentialHelp.note && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                  {selectedProvider.credentialHelp.note}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  onClick={handleCreate}
                  disabled={submitting || dataTypes.length === 0}
                  data-testid="button-add-provider-submit"
                >
                  {submitting ? 'Adding...' : 'Add Provider'}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
