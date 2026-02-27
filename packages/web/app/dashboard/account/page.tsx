'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { User, KeyRound, Settings, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { settingsApi, type IUserSettingsResponse } from '@/lib/api/settings';
import { authApi } from '@/lib/api/auth';

export default function AccountPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const s = (await settingsApi.get()) as IUserSettingsResponse;
        if (s.profile) {
          setName(s.profile.name ?? '');
          setEmail(s.profile.email ?? '');
        }
      } catch {
        // fallback handled by api
      } finally {
        setIsLoaded(true);
      }
    })();
  }, []);

  const handleSendPasswordReset = async () => {
    if (!email?.trim()) {
      setResetError('No email on file. Update your email in Settings first.');
      return;
    }
    setResetError(null);
    setResetSent(false);
    setSendingReset(true);
    try {
      const result = await authApi.requestPasswordReset(email.trim());
      if (result.success) {
        setResetSent(true);
      } else {
        setResetError(result.error ?? 'Failed to send reset link');
      }
    } catch {
      setResetError('Failed to send reset link');
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="dashboard-account-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage your account and security
        </p>
      </div>

      {isLoaded && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Profile
              </CardTitle>
              <CardDescription>
                Your account details. Edit name and email in Settings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Name:</span>
                <span>{name || '—'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Email:</span>
                <span>{email || '—'}</span>
              </div>
              <Button variant="outline" size="sm" asChild className="mt-2">
                <Link href="/dashboard/settings" data-testid="link-settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Open Settings
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Password
              </CardTitle>
              <CardDescription>
                Send a password reset link to your email. You will sign out after resetting; sign back in with your new password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {resetSent && (
                <p className="text-sm text-green-600 dark:text-green-400" data-testid="reset-sent-message">
                  Check your inbox at {email}. Click the link in the email to set a new password.
                </p>
              )}
              {resetError && (
                <p className="text-sm text-destructive" data-testid="reset-error">
                  {resetError}
                </p>
              )}
              <Button
                type="button"
                variant="default"
                disabled={sendingReset || !email?.trim()}
                onClick={handleSendPasswordReset}
                data-testid="button-send-password-reset"
              >
                {sendingReset ? 'Sending…' : 'Send password reset email'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
