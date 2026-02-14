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
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState<'success' | 'error' | null>(null);

  const handleExploreDemo = async () => {
    setDemoLoading(true);
    setDemoError('');
    setResetMessage(null);
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

  const handleResetDemo = async () => {
    setResetLoading(true);
    setResetMessage(null);
    setDemoError('');
    try {
      const res = await fetch(`${API_BASE}/seed/demo/reset`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setResetMessage('success');
      } else {
        setResetMessage('error');
      }
    } catch {
      setResetMessage('error');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-gray-950 md:py-16">
      <div className="mx-auto max-w-2xl space-y-10">
        {/* Purpose and source */}
        <section className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Scholaracle</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            AI-powered parenting assistant for academic success
          </p>
          <div className="prose prose-sm mx-auto max-w-none text-left text-gray-600 dark:prose-invert dark:text-gray-400">
            <p>
              Scholaracle helps families stay on top of student progress, assignments, and deadlines.
              Connect your school or LMS data, get proactive alerts, and see a single view of grades and
              upcoming work. This app is part of the Scholarmancy project—you can run your own instance
              or use this one to try it out.
            </p>
          </div>
        </section>

        {/* How to use it */}
        <section className="space-y-3">
          <h2 className="text-center text-xl font-semibold">How to use it</h2>
          <ol className="list-inside list-decimal space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <li>
              <strong className="text-foreground">Try the demo or create an account</strong>—Use the
              demo below with no signup, or register to set up your own students and data.
            </li>
            <li>
              <strong className="text-foreground">Add students and connect data</strong>—Link your
              school or LMS (e.g. Canvas) so we can pull assignments, grades, and events.
            </li>
            <li>
              <strong className="text-foreground">Use the dashboard</strong>—View agenda, alerts,
              and grades in one place. You can reset the demo anytime to start with fresh data.
            </li>
          </ol>
        </section>

        {/* Sign in / Demo card */}
        <Card className="w-full max-w-md mx-auto">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold">Get started</CardTitle>
            <CardDescription>Sign in, register, or explore with the demo account</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                <span className="bg-card px-2">or try the demo</span>
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
              <p className="text-center text-xs text-muted-foreground">
                No account needed. Demo has sample students, alerts, and agenda.
              </p>
              <p className="text-center text-xs text-gray-500 dark:text-gray-400" data-testid="demo-credentials">
                Demo login: <span className="font-mono">{DEMO_EMAIL}</span> /{' '}
                <span className="font-mono">{DEMO_PASSWORD}</span>
              </p>
              {demoError && (
                <p className="text-center text-xs text-red-600 dark:text-red-400" data-testid="demo-error">
                  {demoError}
                </p>
              )}
            </div>

            {/* Reset demo (for shared instance) */}
            <div className="border-t pt-4 space-y-2">
              <p className="text-center text-xs text-muted-foreground">
                Using the shared demo? You can reset it to restore original data (e.g. after
                exploring). If you&apos;re logged in as the demo user, you can also reset from the
                dashboard banner.
              </p>
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={handleResetDemo}
                  disabled={resetLoading}
                  data-testid="button-reset-demo-landing"
                >
                  {resetLoading ? 'Resetting…' : 'Reset demo environment'}
                </Button>
              </div>
              {resetMessage === 'success' && (
                <p className="text-center text-xs text-green-600 dark:text-green-400" data-testid="reset-demo-success">
                  Demo reset. You can explore the demo again.
                </p>
              )}
              {resetMessage === 'error' && (
                <p className="text-center text-xs text-red-600 dark:text-red-400" data-testid="reset-demo-error">
                  Reset failed. Try again or refresh the page.
                </p>
              )}
            </div>

            <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2 border-t">
              <Link href="/privacy" className="hover:underline">Privacy</Link>
              {' · '}
              <Link href="/terms" className="hover:underline">Terms</Link>
              {' · '}
              <Link href="/support" className="hover:underline">Support</Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
