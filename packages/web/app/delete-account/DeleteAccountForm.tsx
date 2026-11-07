'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountApi } from '@/lib/api/account';
import { apiClient } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';

export function DeleteAccountForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const token = localStorage.getItem('auth_token');
    if (token) {
      apiClient.setToken(token);
      setHasSession(true);
    }
  }, []);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Enter your password to confirm deletion.');
      return;
    }
    setIsSubmitting(true);
    try {
      await accountApi.deleteAccount(password);
      await authApi.logout();
      router.push('/login?deleted=1');
    } catch {
      setError('Could not delete your account. Check your password and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hasSession) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Sign in first to delete your account here, or{' '}
        <Link href="/login?redirect=/delete-account" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          open the sign-in page
        </Link>
        .
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4 rounded-lg border border-red-200 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/20"
      data-testid="form-delete-account"
    >
      <p className="text-sm text-gray-700 dark:text-gray-300">
        This permanently removes your Scholarmancy login, students, synced academic data, alert
        preferences, and push tokens. School portal credentials stay only on devices where you
        connected a source.
      </p>
      <div className="space-y-2">
        <Label htmlFor="delete-account-password">Account password</Label>
        <Input
          id="delete-account-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="input-delete-password"
        />
      </div>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" data-testid="error-delete-account">
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="destructive"
        disabled={isSubmitting}
        data-testid="btn-delete-account"
        data-loading={isSubmitting}
      >
        {isSubmitting ? 'Deleting…' : 'Delete my account permanently'}
      </Button>
    </form>
  );
}
