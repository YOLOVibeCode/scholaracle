'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { getSessionUser } from '@/lib/auth/sessionUser';
import { clearSetPasswordPrompt, shouldPromptSetPassword } from '@/lib/sharing/setPasswordPrompt';

/**
 * One-time, dismissible "Set a password" prompt for an account created by accepting a sharing
 * invitation through a magic link (sharing-spec §4.4 step 3). Password logins that need a reset
 * are redirected by the login page instead, so the two never show together.
 */
export function SetPasswordBanner() {
  const [visible, setVisible] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setVisible(shouldPromptSetPassword());
    setEmail(getSessionUser()?.email ?? null);
  }, []);

  if (!visible) return null;

  const href = `/forgot-password?required=1${email ? `&email=${encodeURIComponent(email)}` : ''}`;
  const dismiss = () => {
    clearSetPasswordPrompt();
    setVisible(false);
  };

  return (
    <Card
      className="border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-900/20"
      data-testid="set-password-banner"
      role="status"
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <KeyRound className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium">Set a password for your account</p>
            <p className="text-xs text-muted-foreground">
              You signed in with an invitation link. Choose a password so you can sign in again
              without one.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" asChild data-testid="set-password-link">
            <Link href={href}>Set a password</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Dismiss"
            onClick={dismiss}
            data-testid="set-password-dismiss"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
