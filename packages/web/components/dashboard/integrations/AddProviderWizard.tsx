'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { integrationsApi, type ICreateIntegrationRequest } from '@/lib/api/integrations';

export interface AddProviderWizardProps {
  open: boolean;
  onClose: () => void;
  onAdded?: () => void;
}

const PROVIDERS = [
  { id: 'canvas', name: 'Canvas LMS', adapterId: 'com.instructure.canvas', available: true },
  { id: 'skyward', name: 'Skyward', adapterId: 'com.skyward', available: false },
  { id: 'google-classroom', name: 'Google Classroom', adapterId: 'com.google.classroom', available: false },
] as const;

export function AddProviderWizard({ open, onClose, onAdded }: AddProviderWizardProps) {
  const [step, setStep] = useState(1);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number] | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [portalBaseUrl, setPortalBaseUrl] = useState('');
  const [schedule, setSchedule] = useState<ICreateIntegrationRequest['schedule']>('every_6h');
  const [dataTypes, setDataTypes] = useState<string[]>(['grades', 'assignments', 'calendar']);
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setStep(1);
    setProvider(null);
    setDisplayName('');
    setPortalBaseUrl('');
    setSchedule('every_6h');
    setDataTypes(['grades', 'assignments', 'calendar']);
    onClose();
  };

  const handleStep1Next = (p: (typeof PROVIDERS)[number]) => {
    if (!p.available) return;
    setProvider(p);
    setStep(2);
  };

  const handleStep2Next = () => {
    setStep(3);
  };

  const handleAdd = async () => {
    if (!provider) return;
    setSubmitting(true);
    const payload: ICreateIntegrationRequest = {
      provider: provider.id,
      adapterId: provider.adapterId,
      displayName: displayName || `${provider.name} - ${portalBaseUrl || 'Source'}`,
      portalBaseUrl: portalBaseUrl || undefined,
      schedule,
      dataTypes,
      enabled: true,
    };
    const result = await integrationsApi.create(payload);
    setSubmitting(false);
    if (result) {
      onAdded?.();
      handleClose();
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="sm:max-w-md" data-testid="add-provider-wizard">
        <SheetHeader>
          <SheetTitle>Add Provider</SheetTitle>
        </SheetHeader>
        <div className="py-4 space-y-4">
          {step === 1 && (
            <>
              <p className="text-sm text-muted-foreground">Choose your LMS provider</p>
              <div className="grid gap-2">
                {PROVIDERS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleStep1Next(p)}
                    disabled={!p.available}
                    className="flex items-center justify-between rounded-lg border p-3 text-left hover:bg-muted/50 disabled:opacity-50 transition-colors"
                    data-testid={`add-provider-${p.id}`}
                  >
                    <span>{p.name}</span>
                    {!p.available && <span className="text-xs text-muted-foreground">Coming soon</span>}
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && provider && (
            <>
              <p className="text-sm text-muted-foreground">Enter connection details</p>
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
            </>
          )}

          {step === 3 && provider && (
            <>
              <p className="text-sm text-muted-foreground">Set default schedule and data types for this integration.</p>
              <div className="space-y-2">
                <Label>Schedule</Label>
                <div className="flex gap-2 flex-wrap">
                  {(['hourly', 'every_6h', 'daily', 'manual'] as const).map((s) => (
                    <label key={s} className="flex items-center gap-1 text-sm">
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
                    <label key={t} className="flex items-center gap-1 text-sm">
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
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleAdd}
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
