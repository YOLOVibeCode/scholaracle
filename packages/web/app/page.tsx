'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/lib/api/auth';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:2801/api';
const DEMO_EMAIL = 'demo@scholaracle.com';
const DEMO_PASSWORD = 'DemoPass123!';

export default function HomePage() {
  const router = useRouter();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState('');

  const handleExploreDemo = async () => {
    setDemoLoading(true);
    setDemoError('');
    try {
      const seedRes = await fetch(`${API_BASE}/seed/demo`, { method: 'POST' });
      const seedData = await seedRes.json().catch(() => ({}));
      if (!seedRes.ok) {
        setDemoError(seedData?.error ?? 'Failed to load demo');
        return;
      }
      const loginResult = await authApi.login(DEMO_EMAIL, DEMO_PASSWORD, true);
      if (!loginResult.success || !loginResult.token) {
        setDemoError(loginResult.error ?? 'Demo login failed');
        return;
      }
      router.push('/dashboard');
    } catch (e) {
      setDemoError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-3xl font-bold">Scholaracle</CardTitle>
          <CardDescription>AI-powered parenting assistant for academic success</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Track your student&apos;s academic progress, get proactive alerts, and stay on top of assignments and deadlines.
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/register">Create Account</Link>
            </Button>
          </div>
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase text-muted-foreground">
              <span className="bg-card px-2">or</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={handleExploreDemo}
              disabled={demoLoading}
              data-testid="button-explore-demo"
            >
              {demoLoading ? 'Loading demo…' : 'Explore Demo'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">No account needed</p>
            <p className="text-center text-xs text-gray-500 dark:text-gray-400" data-testid="demo-credentials">
              Demo: <span className="font-mono">{DEMO_EMAIL}</span> / <span className="font-mono">{DEMO_PASSWORD}</span>
            </p>
            {demoError && (
              <p className="text-center text-xs text-red-600 dark:text-red-400" data-testid="demo-error">
                {demoError}
              </p>
            )}
          </div>
          <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2">
            <Link href="/privacy" className="hover:underline">Privacy</Link>
            {' · '}
            <Link href="/terms" className="hover:underline">Terms</Link>
            {' · '}
            <Link href="/support" className="hover:underline">Support</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
