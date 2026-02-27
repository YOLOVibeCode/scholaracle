'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { adminAuthApi } from '@/lib/api/admin/auth';
import { Shield } from 'lucide-react';

export interface MFASetupWizardProps {
  mfaSetupToken: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function MFASetupWizard({ mfaSetupToken, onComplete, onCancel }: MFASetupWizardProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [manualEntryKey, setManualEntryKey] = useState<string | null>(null);
  const [totpToken, setTotpToken] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await adminAuthApi.getMFASetupData(mfaSetupToken);
        if (cancelled) return;
        if (result.success && result.qrCodeUrl && result.manualEntryKey) {
          setQrCodeUrl(result.qrCodeUrl);
          setManualEntryKey(result.manualEntryKey);
        } else {
          setError(result.error ?? 'Failed to load MFA setup');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load MFA setup');
        }
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [mfaSetupToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await adminAuthApi.completeMFASetup(mfaSetupToken, totpToken);

      if (result.success) {
        onComplete();
      } else {
        setError(result.error ?? 'Verification failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (setupLoading) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <p className="text-center text-gray-600 dark:text-gray-400">Loading MFA setup...</p>
        </CardContent>
      </Card>
    );
  }

  if (error && !qrCodeUrl) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div
            data-testid="message-error"
            className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm"
          >
            {error}
          </div>
          <Button type="button" variant="outline" className="mt-4 w-full" onClick={onCancel}>
            Back to login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
            <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <CardTitle className="text-2xl">Set up two-factor authentication</CardTitle>
        <CardDescription>
          Scan the QR code with your authenticator app, then enter the 6-digit code below.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {qrCodeUrl && (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR code data URL, not a static asset */}
              <img
                src={qrCodeUrl}
                alt="MFA QR code"
                className="w-48 h-48 border rounded-lg"
                data-testid="mfa-qr-code"
              />
            </div>
          )}
          {manualEntryKey && (
            <div className="space-y-2">
              <Label>Manual entry key</Label>
              <p
                className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded break-all"
                data-testid="mfa-manual-key"
              >
                {manualEntryKey}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="totp">Verification code</Label>
            <Input
              id="totp"
              data-testid="input-mfa-code"
              type="text"
              placeholder="000000"
              value={totpToken}
              onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              required
              autoFocus
            />
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>
          {error && (
            <div
              data-testid="message-error"
              className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm"
            >
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onCancel}
              disabled={isLoading}
            >
              Back
            </Button>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || totpToken.length !== 6}
              data-testid="button-verify-mfa"
            >
              {isLoading ? 'Verifying...' : 'Verify and sign in'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
