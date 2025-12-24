"use client";

import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminAuthApi } from '@/lib/api/admin/auth';

export interface IAdminStepUpSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onVerified: (stepUpToken: string) => void;
  readonly title?: string;
  readonly description?: string;
}

export function AdminStepUpSheet(props: IAdminStepUpSheetProps) {
  const { open, onOpenChange, onVerified } = props;
  const title = props.title ?? 'Re-verify MFA';
  const description = props.description ?? 'Enter your authenticator code to continue.';

  const [isBooting, setIsBooting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [stepUpId, setStepUpId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canVerify = useMemo(() => !!stepUpId && code.trim().length >= 6 && !isBooting && !isVerifying, [stepUpId, code, isBooting, isVerifying]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);
    setCode('');
    setStepUpId(null);
    setIsBooting(true);

    adminAuthApi
      .stepUpStart()
      .then((res) => {
        if (cancelled) return;
        if (!res.success || !res.data?.stepUpId) {
          setError(res.error ?? 'Failed to start step-up');
          return;
        }
        setStepUpId(res.data.stepUpId);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to start step-up');
      })
      .finally(() => {
        if (cancelled) return;
        setIsBooting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const submit = async () => {
    if (!stepUpId) return;
    setError(null);
    setIsVerifying(true);
    try {
      const res = await adminAuthApi.stepUpVerify(stepUpId, code.trim());
      if (!res.success || !res.data?.stepUpToken) {
        setError(res.error ?? 'Invalid code');
        return;
      }
      onVerified(res.data.stepUpToken);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-testid="mfa-stepup-sheet">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 p-4">
          {error && (
            <div role="alert" className="rounded-md border p-2 text-sm" data-testid="mfa-stepup-error">
              {error}
            </div>
          )}

          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            disabled={isBooting || isVerifying}
            data-testid="mfa-stepup-code"
          />

          <p className="text-xs text-gray-600 dark:text-gray-400">
            {isBooting ? 'Preparing challenge…' : 'Codes are time-based; if it fails, try the next code.'}
          </p>
        </div>

        <SheetFooter>
          <Button onClick={submit} disabled={!canVerify} data-testid="mfa-stepup-confirm">
            {isVerifying ? 'Verifying…' : 'Confirm'}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBooting || isVerifying} data-testid="mfa-stepup-cancel">
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}


