'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api/auth';

export default function ForgotPasswordPage() {
  const searchParams = useSearchParams();
  const requiredParam = searchParams.get('required') === '1';
  const emailParam = searchParams.get('email') ?? '';
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (emailParam && !email) setEmail(decodeURIComponent(emailParam));
  }, [emailParam, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setIsLoading(true);

    try {
      const result = await authApi.requestPasswordReset(email);

      if (result.success) {
        setSuccess(true);
      } else {
        setError(result.error ?? 'Something went wrong');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Forgot password</CardTitle>
          <CardDescription>
            {requiredParam
              ? 'You must reset your password. Enter your email to receive a reset link.'
              : "Enter your email and we'll send you a link to reset your password."}
          </CardDescription>
        </CardHeader>
        <form data-testid="form-forgot-password" onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div
                data-testid="message-error"
                className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200"
              >
                {error}
              </div>
            )}
            {success && (
              <div
                data-testid="message-success"
                className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200"
              >
                If an account exists for that email, we&apos;ve sent a password reset link. Check your inbox.
              </div>
            )}
            {!success && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  data-testid="input-email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            {!success && (
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                data-testid="button-submit-forgot"
              >
                {isLoading ? 'Sending...' : 'Send reset link'}
              </Button>
            )}
            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              <Link
                href="/login"
                className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                data-testid="link-back-to-login"
              >
                Back to sign in
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
