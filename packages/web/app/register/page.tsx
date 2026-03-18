'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { authApi } from '@/lib/api/auth';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);

    try {
      const result = await authApi.register(email, password, name, {
        phone: phone || undefined,
        smsConsent,
      });

      if (result.success) {
        router.push('/dashboard');
      } else {
        setError(result.error ?? 'Registration failed');
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
          <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
          <CardDescription>Sign up for Scholaracle to get started</CardDescription>
        </CardHeader>
        <form data-testid="form-register" onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div data-testid="message-error" className="rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                data-testid="input-name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
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
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                data-testid="input-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone (optional, for SMS alerts)</Label>
              <Input
                id="phone"
                name="phone"
                data-testid="input-phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={isLoading}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <input
                  id="termsConsent"
                  name="termsConsent"
                  type="checkbox"
                  required
                  disabled={isLoading}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                  data-testid="terms-consent-checkbox"
                />
                <Label htmlFor="termsConsent" className="text-sm font-normal cursor-pointer">
                  I agree to the{' '}
                  <Link href="/terms" className="font-medium text-blue-600 hover:underline dark:text-blue-400" target="_blank">
                    Terms of Service
                  </Link>
                  {' '}
                  and{' '}
                  <Link href="/privacy" className="font-medium text-blue-600 hover:underline dark:text-blue-400" target="_blank">
                    Privacy Policy
                  </Link>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <input
                  id="smsConsent"
                  name="smsConsent"
                  type="checkbox"
                  checked={smsConsent}
                  onChange={(e) => setSmsConsent(e.target.checked)}
                  disabled={isLoading}
                  className="mt-1 h-4 w-4 rounded border-gray-300"
                  data-testid="sms-consent-checkbox"
                />
                <Label htmlFor="smsConsent" className="text-sm font-normal cursor-pointer">
                  I agree to receive SMS text message alerts about assignments and deadlines. Standard message
                  and data rates may apply. Reply STOP to opt out, HELP for support.
                </Label>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <OAuthButtons disabled={isLoading} onError={setError} />
            <div className="relative text-center text-sm text-gray-500">
              <span className="bg-white px-2 dark:bg-gray-900">or</span>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register">
              {isLoading ? 'Creating account...' : 'Create account'}
            </Button>
            <div className="text-center text-sm text-gray-600 dark:text-gray-400">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400" data-testid="link-login">
                Sign in
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

