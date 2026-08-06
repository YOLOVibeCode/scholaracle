'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { authApi } from '@/lib/api/auth';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const redirectTo = searchParams.get('redirect');
  const sessionExpired = searchParams.get('reason') === 'session_expired';
  const resetSuccess = searchParams.get('reset') === 'success';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await authApi.login(email, password, rememberMe);

      if (result.success) {
        if (result.forcePasswordReset && result.user?.email) {
          router.push(
            `/forgot-password?required=1&email=${encodeURIComponent(result.user.email)}`
          );
        } else {
          const dest = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/dashboard';
          router.push(dest);
        }
      } else {
        setError(result.error ?? 'Login failed');
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
        <CardHeader className="space-y-1 items-center text-center">
          <Image
            src="/logo.png"
            alt="Scholarmancy"
            width={64}
            height={64}
            className="rounded-2xl mb-1"
          />
          <CardTitle className="text-2xl font-bold">Scholarmancy</CardTitle>
          <CardDescription>Sign in to your account</CardDescription>
        </CardHeader>
        <form data-testid="form-login" onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {sessionExpired && (
              <div
                data-testid="message-session-expired"
                className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
              >
                Your session expired. Please sign in again.
              </div>
            )}
            {resetSuccess && (
              <div
                data-testid="message-reset-success"
                className="rounded-md bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200"
              >
                Password updated. You can sign in with your new password.
              </div>
            )}
            {error && (
              <div data-testid="message-error" className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}
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
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                data-testid="input-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isLoading}
                    className="rounded border-gray-300"
                    data-testid="input-remember-me"
                  />
                  <span>Remember me</span>
                </label>
                <Link
                  href="/forgot-password"
                  className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <OAuthButtons disabled={isLoading} onError={setError} />
            <div className="relative text-center text-sm text-gray-500">
              <span className="bg-white px-2 dark:bg-gray-900">or</span>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="font-medium text-blue-600 hover:underline dark:text-blue-400" data-testid="link-register">
                Sign up
              </Link>
            </div>
            <div className="text-center text-xs text-gray-500 dark:text-gray-400">
              <Link href="/privacy" className="hover:underline">Privacy</Link>
              {' · '}
              <Link href="/terms" className="hover:underline">Terms</Link>
              {' · '}
              <Link href="/support" className="hover:underline">Support</Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
              <CardDescription>Sign in to your Scholarmancy account</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-muted-foreground">Loading…</p>
            </CardContent>
          </Card>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}