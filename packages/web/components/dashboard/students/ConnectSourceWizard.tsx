'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { IAddSourceRequest } from '@/lib/api/sources';

export interface ConnectSourceWizardProps {
  open: boolean;
  studentId: string;
  onClose: () => void;
  onConnected?: () => void;
}

const PROVIDERS = [
  { id: 'canvas', name: 'Canvas LMS', adapterId: 'com.instructure.canvas', available: true },
  { id: 'skyward', name: 'Skyward', adapterId: 'com.skyward', available: false },
  { id: 'google', name: 'Google Classroom', adapterId: 'com.google.classroom', available: false },
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
  const [schedule, setSchedule] = useState<IAddSourceRequest['schedule']>('every_6h');
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

  const handleStep1Next = (p: typeof PROVIDERS[number]) => {
    if (!p.available) return;
    setProvider(p);
    setStep(2);
  };

  const handleStep2Next = () => {
    setStep(3);
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
            </>
          )}

          {step === 3 && provider && (
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
                <Button type="button" variant="outline" onClick={() => setStep(2)}>
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
