'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';
import { apiClient } from '@/lib/api/client';

export default function CliAuthPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isLoggedIn = !!authApi.getToken();

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    try {
      const result = await apiClient.post<{ success: boolean; message?: string; error?: string }>(
        '/auth/cli/approve',
        { userCode: code.toUpperCase().trim() }
      );

      if (result.success) {
        setSuccess(result.message ?? 'CLI authorized successfully!');
        setCode('');
      } else {
        setError(result.error ?? 'Failed to approve');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeny = async () => {
    setError('');
    setIsLoading(true);

    try {
      await apiClient.post('/auth/cli/deny', { userCode: code.toUpperCase().trim() });
      setSuccess('Code denied.');
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">CLI Authorization</CardTitle>
            <CardDescription>
              You need to sign in first to authorize a CLI tool.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => router.push(`/login?redirect=${encodeURIComponent('/cli-auth')}`)}
            >
              Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Authorize CLI Access</CardTitle>
          <CardDescription>
            Enter the code shown in your terminal to grant access.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleApprove}>
          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200">
                {success}
              </div>
            )}
            {!success && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="code">Authorization Code</Label>
                  <Input
                    id="code"
                    placeholder="ABCD-1234"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="text-center text-2xl tracking-widest font-mono"
                    maxLength={9}
                    autoFocus
                  />
                </div>
                <div className="flex gap-3">
                  <Button type="submit" className="flex-1" disabled={isLoading || code.length < 9}>
                    {isLoading ? 'Authorizing...' : 'Approve'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDeny}
                    disabled={isLoading || code.length < 9}
                  >
                    Deny
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
